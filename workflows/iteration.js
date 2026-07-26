export const meta = {
  name: 'issue-loop-iteration',
  description:
    'issue-loop の1イテレーション（PR同期→Issue選定→情報収集→分類→実装/レビュー→PR作成）を実行し、結果を構造化して返す',
}

// args（JSON オブジェクトとして渡す前提。JSON 文字列で渡してはならない）:
//   pluginRoot: issue-loop プラグインのルート絶対パス（エージェントが指示ファイルを参照するために使う）
//   maxReviewIterations: 実装/レビューの最大反復回数（デフォルト: 3）。
//     再ラウンドは CRITICAL/HIGH 指摘か CI 失敗があった場合のみ発生する
//   answers: NEEDS_INPUT 後の再実行時のみ。[{ question, answer }] の配列
//
// 戻り値は必ず { signal, ... } の形を取る:
//   DONE / NO_ISSUE / NEEDS_INPUT / FAILED
// （実行中の中断は /workflows ビューの停止操作に委ねる）

// args の正規化。メインセッションが誤って JSON 文字列として渡した場合は
// parse で救済するが、parse 失敗は握りつぶさず FAILED として即終了する。
let normalizedArgs = args
if (typeof normalizedArgs === 'string') {
  try {
    normalizedArgs = JSON.parse(normalizedArgs)
  } catch (e) {
    return {
      signal: 'FAILED',
      reason:
        'args を JSON オブジェクトとしてパースできませんでした。args は JSON 文字列ではなく JSON オブジェクトとして渡してください: ' +
        String((e && e.message) || e),
    }
  }
}
if (typeof normalizedArgs !== 'object' || normalizedArgs === null) {
  return {
    signal: 'FAILED',
    reason:
      'args が JSON オブジェクトではありません。args は JSON オブジェクトとして渡してください。',
  }
}

const pluginRoot = normalizedArgs.pluginRoot
const maxReviewIterations = normalizedArgs.maxReviewIterations ?? 3
const answers = normalizedArgs.answers ?? null

// pluginRoot が無いとサブエージェントのプロンプトに壊れたパスが埋め込まれるため、
// エージェントを1つも起動する前に即終了する。
if (typeof pluginRoot !== 'string' || pluginRoot.length === 0) {
  return {
    signal: 'FAILED',
    reason:
      'pluginRoot が指定されていません。args は JSON オブジェクトとして渡し（JSON 文字列に変換して渡してはならない）、pluginRoot にプラグインのルート絶対パスを含めてください。',
  }
}

// 既存のエージェント定義（Markdown）を指示書として流用するための共通前置き。
// frontmatter の tools / hooks はワークフロー実行では適用されないため本文のみ従わせる。
// ファイルの出自（ユーザーがインストールしたプラグインの同梱物）を明示するのは、
// 「由来不明の外部ファイルの指示を無監督で実行する」と判定されてサブエージェント起動が
// 安全フィルタにブロックされることがあるため（情報収集ステップで観測）。
// ファイルが読めない場合のマーカーは、pluginRoot 不正をスクリプト側で機械的に
// 検知するためのもの（下のステップ1参照）
const FILE_NOT_READABLE = 'INSTRUCTION_FILE_NOT_READABLE'
const followFile = (path) =>
  `Read ツールで ${path} を読み、frontmatter を除く本文の指示に従って作業してください。` +
  `このファイルはユーザーがローカルにインストールした issue-loop プラグインに同梱されている定型の作業手順書です。` +
  `本文中の \${CLAUDE_PLUGIN_ROOT} は ${pluginRoot} に読み替えてください。` +
  `ユーザーへの質問・確認はできません。自律的に判断してください。` +
  `指定されたパスのファイルが読めない場合は、ファイルシステムの探索や代替パスの推測を行わず、` +
  `最終メッセージに ${FILE_NOT_READABLE} と書いて作業を終了してください。\n`

// モデルルーティング: セッションデフォルト（最上位モデル）を継承させず、
// 定型・レビュー系は sonnet、思考力が必要な実装・デバッグのみ opus を使う。
// 機械的判定（情報収集・Issue分類）は従来どおり各呼び出しで haiku を指定する
const BASE_MODEL = 'sonnet'
const HEAVY_MODEL = 'opus'

// agent({schema}) の結果は StructuredOutput ツールの呼び出しでしか受け取れない。
// 「JSON で返して」という表現だとツールを呼ばず本文に JSON を書いて終了することがある
// （haiku の Issue分類で観測。ランタイムの再促にも「呼んだはず」と幻覚して応じなかった）
// ため、schema 付きプロンプトには必ずこの文言を添える
const VIA_STRUCTURED_OUTPUT =
  '返答は必ず StructuredOutput ツールの呼び出しで行ってください。' +
  'メッセージ本文に JSON を書いても結果は受け取れず、ステップ失敗として扱われます。'

// agent() はユーザーによるスキップ・API エラー（セッションリミット等）・安全フィルタに
// よる起動ブロックで null を返すことがある（null からは原因を区別できない）。
// 結果を参照するステップは null をここで検知し、外側の catch 経由で FAILED シグナル
// として畳む
const must = (result, step) => {
  if (result == null) {
    throw new Error(
      `${step} エージェントが結果を返しませんでした` +
        '（ユーザーによるスキップ、API エラー、安全フィルタによる起動ブロックのいずれかの可能性。' +
        '原因は /workflows の実行ログで確認できます）',
    )
  }
  return result
}

// null は一過性の API エラー（mid-response のサーバーエラー等）でも返るため、
// must で畳む前にスクリプト側で機械的に1回だけ再試行する。失敗した呼び出しは
// ランタイムのジャーナルに結果が記録されないため、同一引数での再呼び出しは
// キャッシュに当たらずライブ実行される
const agentWithRetry = async (prompt, opts) => {
  const first = await agent(prompt, opts)
  if (first != null) return first
  log(`${opts.label}: 結果が返りませんでした。1回だけ再試行します`)
  return agent(prompt, opts)
}

try {
  // ── ステップ 1: PR同期 ──────────────────────────────
  // 最初の followFile ステップで pluginRoot の実在検証を兼ねる。ここで指示ファイルが
  // 読めない場合は pluginRoot 自体が誤っており後続の全ステップが壊れるため、続行せず
  // 即 FAILED を返す（誤った pluginRoot のまま後続が空走した実行を観測）
  const synced = must(
    await agentWithRetry(followFile(`${pluginRoot}/agents/loop/pr-sync.md`), {
      label: 'PR同期',
      model: BASE_MODEL,
    }),
    'PR同期',
  )
  if (typeof synced === 'string' && synced.includes(FILE_NOT_READABLE)) {
    return {
      signal: 'FAILED',
      reason:
        `pluginRoot（${pluginRoot}）配下の指示ファイルが読めません。` +
        'args.pluginRoot に issue-loop プラグインのルート絶対パスを渡してください。',
    }
  }

  // ── ステップ 2: Issue選定 ────────────────────────────
  // current-issue.md の書き出しは従来どおり行わせつつ（後続エージェントが読む）、
  // 制御フロー用の判定はファイルではなく構造化リターンで受け取る
  const picked = must(
    await agentWithRetry(
      followFile(`${pluginRoot}/agents/loop/pick-issue.md`) +
        '作業完了後、選定結果を返してください。取り組む Issue がない場合は found: false とします。' +
        VIA_STRUCTURED_OUTPUT,
      {
        label: 'Issue選定',
        model: BASE_MODEL,
        schema: {
          type: 'object',
          required: ['found'],
          properties: {
            found: { type: 'boolean' },
            number: { type: 'number' },
            title: { type: 'string' },
          },
        },
      },
    ),
    'Issue選定',
  )

  if (!picked.found) {
    return { signal: 'NO_ISSUE' }
  }

  // ── ステップ 3: 情報収集 ─────────────────────────────
  // answers の有無でプロンプトが変わるため、NEEDS_INPUT 後に resumeFromRunId で
  // 再実行すると、前段（PR同期・Issue選定）はキャッシュが返り、ここから先だけが
  // 再実行される
  const infoPrompt = answers
    ? followFile(`${pluginRoot}/agents/loop/info-gathering.md`) +
      'ユーザーへの質問は既に完了しています。「回答が既にある場合（再開時）」の手順に従い、' +
      '以下の回答（answers.md の代わりにここに直接示す）を current-issue.md への追記と' +
      ' Issue へのコメントに反映してください。質問は生成せず needsInput: false を返します。' +
      VIA_STRUCTURED_OUTPUT + '\n' +
      answers.map((a) => `- ${a.question}: ${a.answer}`).join('\n')
    : followFile(`${pluginRoot}/agents/loop/info-gathering.md`) +
      'ただし questions.md へのファイル書き出しは行わず、質問の要否と内容を返してください。' +
      '情報が十分なら needsInput: false、不足があれば needsInput: true と questions を返します。' +
      VIA_STRUCTURED_OUTPUT

  const info = must(await agentWithRetry(infoPrompt, {
    label: '情報収集',
    model: 'haiku',
    schema: {
      type: 'object',
      required: ['needsInput'],
      properties: {
        needsInput: { type: 'boolean' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['question', 'header', 'options'],
            properties: {
              question: { type: 'string' },
              header: { type: 'string' },
              multiSelect: { type: 'boolean' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['label', 'description'],
                  properties: {
                    label: { type: 'string' },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }), '情報収集')

  if (info.needsInput) {
    return {
      signal: 'NEEDS_INPUT',
      issue: picked.number,
      title: picked.title,
      questions: info.questions ?? [],
    }
  }

  // ── ステップ 4: Issue分類 ────────────────────────────
  // 従来の next-action.md への書き出しを構造化リターンで置き換える
  const classified = must(await agentWithRetry(
    `Read ツールで ${pluginRoot}/agents/loop/pattern.md` +
      '（ユーザーがローカルにインストールした issue-loop プラグイン同梱の分類基準）を読み、その分類基準に従って' +
      ' .issue-loop/current-issue.md の Issue を分類してください。' +
      ' frontmatter の type: の更新は指示どおり行いますが、next-action.md は書き出さないでください。' +
      VIA_STRUCTURED_OUTPUT,
    {
      label: 'Issue分類',
      model: 'haiku',
      schema: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['Feature', 'Debug', 'Refactor', 'Test'] },
        },
      },
    },
  ), 'Issue分類')
  const nextAction = classified.type === 'Debug' ? 'debug' : 'implement'

  // ── ステップ 5: ブランチ作成 ──────────────────────────
  // ここが失敗したまま続行すると実装が main 上で走るため、結果を必ず検証する
  must(await agentWithRetry(
    '以下を順に実行してください:\n' +
      '1. git checkout main\n' +
      '2. git pull --ff-only（失敗しても続行してよい）\n' +
      `3. Issue #${picked.number}「${picked.title}」用のブランチを issue-<番号>-<kebab-case-slug> 形式で` +
      ' git checkout -b で作成する（タイトルから英数字・ハイフンのみ使用、スペースはハイフンに変換）\n' +
      '4. 前イテレーションの残骸を削除する: rm -f .issue-loop/changes.diff .issue-loop/out-of-scope.md .issue-loop/review-result.md .issue-loop/next-action.md\n' +
      '完了後、作成したブランチ名を返してください。' +
      VIA_STRUCTURED_OUTPUT,
    {
      label: 'ブランチ作成',
      model: BASE_MODEL,
      schema: {
        type: 'object',
        required: ['branch'],
        properties: { branch: { type: 'string' } },
      },
    },
  ), 'ブランチ作成')

  // ── ステップ 6: 実装・レビューループ ───────────────────
  // 従来 review オーケストレーターエージェントが担っていたファンアウトと集約を
  // スクリプト側で行う。review-result.md / out-of-scope.md はスクリプト変数に置き換わる

  const reviewContract =
    'レビュー対象の変更は Read ツールで .issue-loop/changes.diff を読むこと' +
    '（git diff を自分で実行してはならない。やむを得ない場合は必ず git diff HEAD を使う）。' +
    '指摘は2つに分類する: scope_in = この変更で新たに導入された問題（今回修正する）、' +
    'scope_out = 変更が触れた/露出させた既存コードの問題（記録のみ、今回は修正しない）。' +
    '各指摘は "<重大度 CRITICAL/HIGH/MEDIUM/LOW> — <file>:<line> — <説明と推奨対応>" 形式の文字列とする。' +
    'CRITICAL/HIGH はマージをブロックすべき問題（バグ・脆弱性・データ破壊等）に限って使い、迷う場合は MEDIUM 以下とする。' +
    VIA_STRUCTURED_OUTPUT

  const reviewSchema = {
    type: 'object',
    required: ['scope_in', 'scope_out'],
    properties: {
      scope_in: { type: 'array', items: { type: 'string' } },
      scope_out: { type: 'array', items: { type: 'string' } },
    },
  }

  // 観点定義がプラグイン内にあるレビュワーはファイルを参照し（単一情報源の維持）、
  // 外部プラグイン由来だったものは観点を直接記述する
  const perspectiveFromFile = (path) =>
    `観点・判断基準は Read ツールで ${path}` +
    '（ユーザーがローカルにインストールした issue-loop プラグイン同梱の観点定義）を読み、' +
    'frontmatter を除く本文に従うこと。'
  const reviewerCatalog = [
    {
      id: 'type-safety',
      label: '型安全性レビュー',
      always: true,
      perspective: perspectiveFromFile(`${pluginRoot}/agents/review/type-safety-reviewer.md`),
    },
    {
      id: 'security',
      label: 'セキュリティレビュー',
      always: true,
      perspective: perspectiveFromFile(`${pluginRoot}/agents/review/security-reviewer.md`),
    },
    {
      id: 'error-handling',
      label: 'エラーハンドリングレビュー',
      always: true,
      perspective:
        '観点: エラーハンドリング。例外の握りつぶし・silent failure・不適切なフォールバックを検出する。' +
        '逆方向の「部分失敗の増幅」も対象: 複数の独立した対象（デバイス・外部API・ファイル等）を' +
        'ループや集約で処理する箇所で、1件の失敗が全体の失敗・全体エラー応答に波及する構造を検出する。' +
        '同種の処理が並存する場合（例: current と daily）のエラーハンドリング非対称も指摘する。',
    },
    {
      id: 'comment',
      label: 'コメントレビュー',
      always: false,
      perspective:
        '観点: コードコメントの妥当性。ファイル冒頭以外は「Why」を説明するコメントのみ許容し、' +
        'What の説明コメントは指摘する。',
    },
    {
      id: 'design',
      label: '設計レビュー',
      always: false,
      perspective: perspectiveFromFile(`${pluginRoot}/agents/review/design-reviewer.md`),
    },
    {
      id: 'test',
      label: 'テストレビュー',
      always: false,
      perspective:
        '観点: テストカバレッジ。既存テストへの影響と、新しいロジックに対するテストの有無を確認する。',
    },
    {
      id: 'performance',
      label: 'パフォーマンスレビュー',
      always: false,
      perspective: perspectiveFromFile(`${pluginRoot}/agents/review/performance-reviewer.md`),
    },
  ]

  let reviewPassed = false
  let findings = [] // 直近ラウンドの CRITICAL/HIGH 指摘（次ラウンドの実装エージェントへ渡す）
  const minorFindings = new Set() // MEDIUM/LOW の scope_in。再ラウンドせずループ後に1回だけ修正する
  const scopeOut = [] // 全ラウンドの scope_out 指摘（後で Issue 登録する）
  let activeReviewers = null // 初回のレビュー準備で確定し、以降のラウンドで追加しない
  let flagged = null // reviewerId -> 前ラウンドの CRITICAL/HIGH 指摘。null はレビュー未完了

  // 再ラウンドのトリガーを CRITICAL/HIGH に限定する。軽微な指摘でフルラウンドを
  // 回すとレビューが収束せず、消費トークンの大半がこのループに吸われるため
  const isBlocking = (f) => /^\s*(CRITICAL|HIGH)\b/i.test(String(f))

  for (let round = 1; round <= maxReviewIterations; round++) {
    // a. 実装またはデバッグ。round 2 以降は再探索させず指摘の解消に限定する。
    // 実装エージェントの途中死（API エラー等）を検知せず続行すると、書きかけの
    // コードがそのままレビュー準備→PR作成へ流れて壊れた PR になるため、結果を
    // 必ず検証する（フォールバックモデル実行で実際に発生）
    const workFile = nextAction === 'debug' ? 'debug.md' : 'implement.md'
    must(await agentWithRetry(
      followFile(`${pluginRoot}/agents/loop/${workFile}`) +
        '.issue-loop/current-issue.md を読み、Issue に対応してください。' +
        (findings.length > 0
          ? '\nこれは前回レビューの指摘対応ラウンドです。Issue の再調査やコードベースの' +
            '広範な再探索は行わず、git diff HEAD で現在の変更を確認したうえで、以下の指摘の' +
            '解消のみを行ってください（review-result.md は存在しない。このリストが正）:\n' +
            findings.join('\n')
          : ''),
      { label: `${nextAction} (round ${round})`, model: HEAVY_MODEL },
    ), `${nextAction} (round ${round})`)

    // b. レビュー準備: 差分の確定・CI 実行。オプショナルレビュワーの選定は
    // レビュワーパネル未確定のときだけ行い、以降は固定する（ラウンドごとに
    // パネルが膨らんで消費が増えるのを防ぐ）
    const prepCommon =
      '以下を順に実行してください:\n' +
      '1. git add -A && git diff HEAD -- . > .issue-loop/changes.diff で変更差分を確定する\n' +
      '2. test -f .issue-loop/ci.sh で CI スクリプトの有無を確認し、存在すれば bash .issue-loop/ci.sh を実行する\n'
    const prepTail =
      'ciPassed は ci.sh が存在しない場合 true とし、' +
      'ciOutput は CI 失敗時のみエラー出力の要約を入れます。' +
      VIA_STRUCTURED_OUTPUT
    const prep = must(
      await agentWithRetry(
        activeReviewers === null
          ? prepCommon +
              '3. .issue-loop/current-issue.md と .issue-loop/changes.diff を読み、以下のオプショナルレビュワーの要否を判断する:\n' +
              '   - comment: コメント・ドキュメント・JSDoc が変更に含まれる場合\n' +
              '   - design: 新しいモジュール・クラス・API の追加、または大規模なリファクタリング\n' +
              '   - test: 新機能追加・バグ修正（再現テストが期待される）の Issue\n' +
              '   - performance: データ取得・ループ処理・DBクエリ・レンダリングに関わる変更\n' +
              prepTail
          : prepCommon + prepTail,
        {
          label: `レビュー準備 (round ${round})`,
          model: BASE_MODEL,
          schema: {
            type: 'object',
            required:
              activeReviewers === null ? ['ciPassed', 'optionalReviewers'] : ['ciPassed'],
            properties: {
              ciPassed: { type: 'boolean' },
              ciOutput: { type: 'string' },
              optionalReviewers: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['comment', 'design', 'test', 'performance'],
                },
              },
            },
          },
        },
      ),
      `レビュー準備 (round ${round})`,
    )

    if (!prep.ciPassed) {
      findings = [
        'CRITICAL — CI — CI が失敗しました。lint / format / test のエラーを修正してください。\n' +
          (prep.ciOutput ?? ''),
      ]
      continue
    }

    if (activeReviewers === null) {
      activeReviewers = reviewerCatalog.filter(
        (r) => r.always || (prep.optionalReviewers ?? []).includes(r.id),
      )
    }

    // c. レビュワーを並列実行し、スクリプト側で集約する。
    // 2回目以降のレビューは、前ラウンドで CRITICAL/HIGH を出したレビュワーだけを
    // 再実行し、確認対象も「前回指摘の解消」と「修正が新たに導入した問題」に絞る
    const toRun =
      flagged === null ? activeReviewers : activeReviewers.filter((r) => flagged.has(r.id))
    const results = await pipeline(toRun, (r) =>
      agent(
        `${r.perspective}\n${reviewContract}` +
          (flagged !== null && flagged.has(r.id)
            ? '\nこれは再レビューです。対象は (1) 以下の前回指摘が解消されたかの確認と、' +
              '(2) 修正が新たに導入した CRITICAL/HIGH の問題の検出のみです。' +
              '新規の MEDIUM/LOW 指摘は報告しないでください:\n' +
              flagged.get(r.id).join('\n')
            : ''),
        {
          label: `${r.label} (round ${round})`,
          model: BASE_MODEL,
          schema: reviewSchema,
        },
      ).then((res) => ({ id: r.id, res })),
    )

    // 結果を返さなかったレビュワー（スキップ・API エラー）の扱い:
    // 全滅は系統的な失敗（セッションリミット等）なので合格と誤判定せず FAILED に畳む。
    // 一部failの場合、そのレビュワーの前回指摘は「解消未確認」として持ち越す
    const returned = results.filter(Boolean).filter((x) => x.res)
    if (returned.length === 0 && toRun.length > 0) {
      throw new Error(`round ${round}: レビュワーが1件も結果を返しませんでした`)
    }
    if (returned.length < toRun.length) {
      log(
        `round ${round}: ${toRun.length - returned.length} 件のレビュワーが結果を返しませんでした`,
      )
    }

    findings = []
    const nextFlagged = new Map()
    for (const { id, res } of returned) {
      const scopeIn = res.scope_in ?? []
      const blocking = scopeIn.filter(isBlocking)
      for (const f of scopeIn) {
        if (!isBlocking(f)) minorFindings.add(f)
      }
      scopeOut.push(...(res.scope_out ?? []))
      if (blocking.length > 0) nextFlagged.set(id, blocking)
      findings.push(...blocking)
    }
    if (flagged !== null) {
      const returnedIds = new Set(returned.map((x) => x.id))
      for (const r of toRun) {
        if (!returnedIds.has(r.id) && flagged.has(r.id)) {
          nextFlagged.set(r.id, flagged.get(r.id))
          findings.push(...flagged.get(r.id))
        }
      }
    }
    flagged = nextFlagged

    if (findings.length === 0) {
      reviewPassed = true
      break
    }
  }

  // MEDIUM/LOW の指摘はまとめて1回だけ修正する（再レビューはしない）
  if (minorFindings.size > 0) {
    await agent(
      'git diff HEAD で現在の変更差分を確認したうえで、以下の軽微なレビュー指摘のうち' +
        '妥当なものを修正してください。指摘リストの範囲を超える変更はしないこと。' +
        '修正後の再レビューはありません:\n' +
        [...minorFindings].join('\n'),
      { label: '軽微な指摘の修正', model: BASE_MODEL },
    )
  }

  // ── ステップ 7: スコープ外指摘の Issue 登録 ─────────────
  if (scopeOut.length > 0) {
    await agent(
      followFile(`${pluginRoot}/agents/loop/issue-update.md`) +
        `対応中の Issue は #${picked.number} です。out-of-scope.md は存在しないため、` +
        '代わりに以下のスコープ外指摘を Issue として登録してください' +
        '（発見した経緯として Issue 番号を本文に含める）:\n' +
        scopeOut.map((s) => `- ${s}`).join('\n'),
      { label: 'スコープ外Issue登録', model: BASE_MODEL },
    )
  }

  // ── ステップ 8: PR作成 ───────────────────────────────
  await agent(
    followFile(`${pluginRoot}/commands/push-and-pr.md`) +
      'Skill ツールが使用できない場合は、コミット・プッシュ・PR 作成を git / gh コマンドで' +
      `直接実行してください（PR 本文に "Closes #${picked.number}" を含める）。`,
    { label: 'PR作成', model: BASE_MODEL },
  )

  // ── ステップ 9: PR検証 ───────────────────────────────
  // push / PR 作成の失敗を検知できないと次イテレーションで同じ Issue を選び続けるため、
  // PR の実在確認は独立したエージェントで行う
  const verify = must(await agentWithRetry(
    'git branch --show-current で現在のブランチ名を取得し、' +
      'gh pr list --head <ブランチ名> --state open --json number,url で PR の実在を確認してください。' +
      (reviewPassed
        ? ''
        : ' PR が存在する場合、gh pr comment <PR番号> --body "[issue-loop] ⚠️ レビュー上限（MAX_REVIEW_ITERATIONS）に達したため、未解決のスコープ内指摘が残ったまま PR を作成しました。マージ前に確認してください。" を投稿してください。') +
      VIA_STRUCTURED_OUTPUT,
    {
      label: 'PR検証',
      model: BASE_MODEL,
      schema: {
        type: 'object',
        required: ['exists'],
        properties: {
          exists: { type: 'boolean' },
          number: { type: 'number' },
          url: { type: 'string' },
        },
      },
    },
  ), 'PR検証')

  if (!verify.exists) {
    return {
      signal: 'FAILED',
      issue: picked.number,
      reason: 'push または PR 作成に失敗しました',
    }
  }

  return {
    signal: 'DONE',
    issue: picked.number,
    title: picked.title,
    pr: verify.number,
    prUrl: verify.url,
    reviewStatus: reviewPassed ? 'pass' : 'fail',
  }
} catch (e) {
  return { signal: 'FAILED', reason: String((e && e.message) || e) }
}
