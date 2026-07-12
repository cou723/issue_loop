export const meta = {
  name: 'issue-loop-iteration',
  description:
    'issue-loop の1イテレーション（PR同期→Issue選定→情報収集→分類→実装/レビュー→PR作成）を実行し、結果を構造化して返す',
}

// args（JSON オブジェクトとして渡す前提。JSON 文字列で渡してはならない）:
//   pluginRoot: issue-loop プラグインのルート絶対パス（エージェントが指示ファイルを参照するために使う）
//   maxReviewIterations: 実装/レビューの最大反復回数（デフォルト: 3）
//   answers: NEEDS_INPUT 後の再実行時のみ。[{ question, answer }] の配列
//
// 戻り値は必ず { signal, ... } の形を取る:
//   DONE / NO_ISSUE / NEEDS_INPUT / FAILED
// （従来の .issue-loop/iteration-signal ファイルの代替。CANCELLED は廃止し、
//   実行中の中断は /workflows ビューの停止操作に委ねる）

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
// frontmatter の tools / hooks はワークフロー実行では適用されないため本文のみ従わせる
const followFile = (path) =>
  `Read ツールで ${path} を読み、frontmatter を除く本文の指示に従って作業してください。` +
  `本文中の \${CLAUDE_PLUGIN_ROOT} は ${pluginRoot} に読み替えてください。` +
  `ユーザーへの質問・確認はできません。自律的に判断してください。` +
  `指定されたパスのファイルが読めない場合は、ファイルシステムの探索や代替パスの推測を行わず、その旨を最終メッセージで報告して作業を終了してください。\n`

try {
  // ── ステップ 1: PR同期 ──────────────────────────────
  await agent(followFile(`${pluginRoot}/agents/loop/pr-sync.md`), {
    label: 'PR同期',
  })

  // ── ステップ 2: Issue選定 ────────────────────────────
  // current-issue.md の書き出しは従来どおり行わせつつ（後続エージェントが読む）、
  // 制御フロー用の判定はファイルではなく構造化リターンで受け取る
  const picked = await agent(
    followFile(`${pluginRoot}/agents/loop/pick-issue.md`) +
      '作業完了後、選定結果を JSON で返してください。取り組む Issue がない場合は found: false とします。',
    {
      label: 'Issue選定',
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
  )

  if (!picked.found) {
    return { signal: 'NO_ISSUE' }
  }

  // ── ステップ 3: 情報収集 ─────────────────────────────
  // answers の有無でプロンプトが変わるため、NEEDS_INPUT 後に resumeFromRunId で
  // 再実行すると、前段（PR同期・Issue選定）はキャッシュが返り、ここから先だけが
  // 再実行される。従来の RESUME フラグとステップスキップ規約の代替
  const infoPrompt = answers
    ? followFile(`${pluginRoot}/agents/loop/info-gathering.md`) +
      'ユーザーへの質問は既に完了しています。「回答が既にある場合（再開時）」の手順に従い、' +
      '以下の回答（answers.md の代わりにここに直接示す）を current-issue.md への追記と' +
      ' Issue へのコメントに反映してください。質問は生成せず needsInput: false を返します。\n' +
      answers.map((a) => `- ${a.question}: ${a.answer}`).join('\n')
    : followFile(`${pluginRoot}/agents/loop/info-gathering.md`) +
      'ただし questions.md へのファイル書き出しは行わず、質問の要否と内容を JSON で返してください。' +
      '情報が十分なら needsInput: false、不足があれば needsInput: true と questions を返します。'

  const info = await agent(infoPrompt, {
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
  })

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
  const classified = await agent(
    `Read ツールで ${pluginRoot}/agents/loop/pattern.md を読み、その分類基準に従って` +
      ' .issue-loop/current-issue.md の Issue を分類してください。' +
      ' frontmatter の type: の更新は指示どおり行いますが、next-action.md は書き出さず、' +
      ' 分類結果を JSON で返してください。',
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
  )
  const nextAction = classified.type === 'Debug' ? 'debug' : 'implement'

  // ── ステップ 5: ブランチ作成 ──────────────────────────
  await agent(
    '以下を順に実行してください:\n' +
      '1. git checkout main\n' +
      '2. git pull --ff-only（失敗しても続行してよい）\n' +
      `3. Issue #${picked.number}「${picked.title}」用のブランチを issue-<番号>-<kebab-case-slug> 形式で` +
      ' git checkout -b で作成する（タイトルから英数字・ハイフンのみ使用、スペースはハイフンに変換）\n' +
      '4. 前イテレーションの残骸を削除する: rm -f .issue-loop/changes.diff .issue-loop/out-of-scope.md .issue-loop/review-result.md .issue-loop/next-action.md\n' +
      '完了後、作成したブランチ名を JSON で返してください。',
    {
      label: 'ブランチ作成',
      schema: {
        type: 'object',
        required: ['branch'],
        properties: { branch: { type: 'string' } },
      },
    },
  )

  // ── ステップ 6: 実装・レビューループ ───────────────────
  // 従来 review オーケストレーターエージェントが担っていたファンアウトと集約を
  // スクリプト側で行う。review-result.md / out-of-scope.md はスクリプト変数に置き換わる

  const reviewContract =
    'レビュー対象の変更は Read ツールで .issue-loop/changes.diff を読むこと' +
    '（git diff を自分で実行してはならない。やむを得ない場合は必ず git diff HEAD を使う）。' +
    '指摘は2つに分類する: scope_in = この変更で新たに導入された問題（今回修正する）、' +
    'scope_out = 変更が触れた/露出させた既存コードの問題（記録のみ、今回は修正しない）。' +
    '各指摘は "<重大度 CRITICAL/HIGH/MEDIUM/LOW> — <file>:<line> — <説明と推奨対応>" 形式の文字列とし、JSON で返す。'

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
  const reviewerCatalog = [
    {
      id: 'type-safety',
      label: '型安全性レビュー',
      always: true,
      perspective:
        `観点・判断基準は Read ツールで ${pluginRoot}/agents/review/type-safety-reviewer.md を読み、` +
        'frontmatter を除く本文に従うこと。',
    },
    {
      id: 'security',
      label: 'セキュリティレビュー',
      always: true,
      perspective:
        `観点・判断基準は Read ツールで ${pluginRoot}/agents/review/security-reviewer.md を読み、` +
        'frontmatter を除く本文に従うこと。',
    },
    {
      id: 'error-handling',
      label: 'エラーハンドリングレビュー',
      always: true,
      perspective:
        '観点: エラーハンドリング。例外の握りつぶし・silent failure・不適切なフォールバックを検出する。',
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
      perspective:
        `観点・判断基準は Read ツールで ${pluginRoot}/agents/review/design-reviewer.md を読み、` +
        'frontmatter を除く本文に従うこと。',
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
      perspective:
        `観点・判断基準は Read ツールで ${pluginRoot}/agents/review/performance-reviewer.md を読み、` +
        'frontmatter を除く本文に従うこと。',
    },
  ]

  let reviewPassed = false
  let findings = [] // 直近レビューの scope_in 指摘（次ラウンドの実装エージェントへ渡す）
  const scopeOut = [] // 全ラウンドの scope_out 指摘（後で Issue 登録する）

  for (let round = 1; round <= maxReviewIterations; round++) {
    // a. 実装またはデバッグ
    const workFile = nextAction === 'debug' ? 'debug.md' : 'implement.md'
    await agent(
      followFile(`${pluginRoot}/agents/loop/${workFile}`) +
        '.issue-loop/current-issue.md を読み、Issue に対応してください。' +
        (findings.length > 0
          ? '\n前回のレビューで以下のスコープ内指摘が出ています。review-result.md は存在しないため、' +
            'この指摘リストを正として必ず解消してください:\n' +
            findings.join('\n')
          : ''),
      { label: `${nextAction} (round ${round})` },
    )

    // b. レビュー準備: 差分の確定・CI 実行・オプショナルレビュワーの選定
    const prep = await agent(
      '以下を順に実行してください:\n' +
        '1. git add -A && git diff HEAD -- . > .issue-loop/changes.diff で変更差分を確定する\n' +
        '2. test -f .issue-loop/ci.sh で CI スクリプトの有無を確認し、存在すれば bash .issue-loop/ci.sh を実行する\n' +
        '3. .issue-loop/current-issue.md と .issue-loop/changes.diff を読み、以下のオプショナルレビュワーの要否を判断する:\n' +
        '   - comment: コメント・ドキュメント・JSDoc が変更に含まれる場合\n' +
        '   - design: 新しいモジュール・クラス・API の追加、または大規模なリファクタリング\n' +
        '   - test: 新機能追加・バグ修正（再現テストが期待される）の Issue\n' +
        '   - performance: データ取得・ループ処理・DBクエリ・レンダリングに関わる変更\n' +
        '結果を JSON で返してください。ciPassed は ci.sh が存在しない場合 true とし、' +
        'ciOutput は CI 失敗時のみエラー出力の要約を入れます。',
      {
        label: `レビュー準備 (round ${round})`,
        schema: {
          type: 'object',
          required: ['ciPassed', 'optionalReviewers'],
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
    )

    if (!prep.ciPassed) {
      findings = [
        'CI が失敗しました。lint / format / test のエラーを修正してください。\n' +
          (prep.ciOutput ?? ''),
      ]
      continue
    }

    // c. レビュワーを並列実行し、スクリプト側で集約する
    const reviewers = reviewerCatalog.filter(
      (r) => r.always || prep.optionalReviewers.includes(r.id),
    )
    const results = await pipeline(reviewers, (r) =>
      agent(`${r.perspective}\n${reviewContract}`, {
        label: `${r.label} (round ${round})`,
        schema: reviewSchema,
      }),
    )

    findings = results.flatMap((r) => r.scope_in ?? [])
    scopeOut.push(...results.flatMap((r) => r.scope_out ?? []))

    if (findings.length === 0) {
      reviewPassed = true
      break
    }
  }

  // ── ステップ 7: スコープ外指摘の Issue 登録 ─────────────
  if (scopeOut.length > 0) {
    await agent(
      followFile(`${pluginRoot}/agents/loop/issue-update.md`) +
        `対応中の Issue は #${picked.number} です。out-of-scope.md は存在しないため、` +
        '代わりに以下のスコープ外指摘を Issue として登録してください' +
        '（発見した経緯として Issue 番号を本文に含める）:\n' +
        scopeOut.map((s) => `- ${s}`).join('\n'),
      { label: 'スコープ外Issue登録' },
    )
  }

  // ── ステップ 8: PR作成 ───────────────────────────────
  await agent(
    followFile(`${pluginRoot}/commands/push-and-pr.md`) +
      'Skill ツールが使用できない場合は、コミット・プッシュ・PR 作成を git / gh コマンドで' +
      `直接実行してください（PR 本文に "Closes #${picked.number}" を含める）。`,
    { label: 'PR作成' },
  )

  // ── ステップ 9: PR検証 ───────────────────────────────
  // push / PR 作成の失敗を検知できないと次イテレーションで同じ Issue を選び続けるため、
  // PR の実在確認は独立したエージェントで行う
  const verify = await agent(
    'git branch --show-current で現在のブランチ名を取得し、' +
      'gh pr list --head <ブランチ名> --state open --json number,url で PR の実在を確認してください。' +
      (reviewPassed
        ? ''
        : ' PR が存在する場合、gh pr comment <PR番号> --body "[issue-loop] ⚠️ レビュー上限（MAX_REVIEW_ITERATIONS）に達したため、未解決のスコープ内指摘が残ったまま PR を作成しました。マージ前に確認してください。" を投稿してください。') +
      ' 結果を JSON で返してください。',
    {
      label: 'PR検証',
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
  )

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
