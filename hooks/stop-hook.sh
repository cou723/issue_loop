#!/bin/bash

# Issue Loop Stop Hook
#
# ループ制御は issueloop スキル内のロジックで完結しており、
# キャンセルは /issue-loop:cancel コマンドが .issue-loop/cancel-requested
# フラグを作成することで行う。このフックは何もしない。

exit 0
