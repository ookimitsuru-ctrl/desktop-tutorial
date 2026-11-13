class_name ComboRunner
extends RefCounted
## コンボのルート（技の列）を、人間と同じ入力で順に出す。CPU とコンボ検証ツールが共用する。
## 入力は自分基準（6 = 相手の方向）。呼び出し側が画面基準に直す。

const N := 5

var w: SimWorld
var me := 0
var cd: CharDef
var route: Array[MoveDef] = []
var idx := 0
var queue: Array[int] = []
var done := false
var failed := false
var hits := 0               # このルートで当たった数
var press_frames: PackedInt32Array = PackedInt32Array()
var _waiting_hit := false   # 直前に出した技のヒット待ち
var _wait_move := -1
var _last_btn := 0


func start(p_w: SimWorld, p_me: int, ids: Array) -> bool:
	w = p_w
	me = p_me
	cd = w.chars[me]
	route.clear()
	for id: Variant in ids:
		var m: MoveDef = cd.move_by_id.get(String(id), null)
		if m == null:
			return false
		route.append(m)
	idx = 0
	queue.clear()
	done = route.is_empty()
	failed = false
	hits = 0
	press_frames = PackedInt32Array()
	_waiting_hit = false
	return true


## ステップ後のイベントを渡す（ヒット確認と失敗判定）
func observe(events: Array[Dictionary]) -> void:
	for e: Dictionary in events:
		if String(e["kind"]) == "hit" and int(e["attacker"]) == me:
			hits += 1
			_waiting_hit = false
	if done or failed:
		return
	var p := w.f[me]
	var o := w.f[1 - me]
	# 出した技が終わってもヒットしていなければ失敗
	if _waiting_hit and p.state != SE.ST_MOVE and queue.is_empty():
		failed = true
		done = true
	# 相手が着地・ダウンから復帰したら終了
	if o.state == SE.ST_STAND or o.state == SE.ST_GUARD or o.state == SE.ST_CROUCH:
		if idx < route.size():
			failed = true
		done = true


## 次のフレームの入力（自分基準）
func next_input() -> int:
	if not queue.is_empty():
		return _emit(queue.pop_front())
	if done or idx >= route.size():
		if idx >= route.size() and not _waiting_hit:
			done = true
		return _emit(InputBits.make(N, 0, 0, 0))
	var p := w.f[me]
	var m := route[idx]
	if m.chain_only:
		# 直前の技の連携として入れる
		if p.state != SE.ST_MOVE or p.chain_next >= 0:
			return _emit(InputBits.make(N, 0, 0, 0))
		var cur := cd.moves[p.move]
		for k: int in range(cur.chain_to.size()):
			if cur.chain_to[k] != m.index:
				continue
			if p.mf >= cur.chain_from[k] and p.mf >= cur.chain_at[k] - 4 and p.mf <= cur.chain_to_f[k]:
				var cdir := cur.chain_dir[k]
				_push_press(cdir if cdir != 0 else N, cur.chain_btn[k])
				return _emit(queue.pop_front())
		return _emit(InputBits.make(N, 0, 0, 0))
	# 通常の技: 動けるようになる直前（先行入力の範囲）で入力する
	var ready := FighterCtl.is_neutral_state(p.state)
	if p.state == SE.ST_MOVE:
		var cur2 := cd.moves[p.move]
		ready = p.mf >= cur2.total() - 2 and not _waiting_hit
	if not ready or _waiting_hit:
		return _emit(InputBits.make(N, 0, 0, 0))
	var c := m.cmd
	for d: int in c.motion:
		queue.append(InputBits.make(d, 0, 0, 0))
	var dd := N
	if c.motion.size() > 0:
		dd = c.motion[c.motion.size() - 1]
	if c.dir != 0:
		dd = c.dir
	_push_press(dd, c.buttons)
	return _emit(queue.pop_front())


func _push_press(dirv: int, btn: int) -> void:
	press_frames.append(w.frame)
	queue.append(InputBits.make(dirv, btn, btn, 0))
	queue.append(InputBits.make(N, 0, 0, btn))
	idx += 1
	_waiting_hit = true


func _emit(v: int) -> int:
	var held := InputBits.held(v)
	var pr := InputBits.pressed(v) | (held & ~_last_btn)
	var rl := _last_btn & ~held
	_last_btn = held
	return InputBits.make(InputBits.dir(v), held, pr, rl)
