class_name SE
extends RefCounted
## シミュレーションの列挙値（Sim Enums）

# ファイター状態
const ST_STAND := 0
const ST_CROUCH := 1
const ST_WALK_F := 2
const ST_WALK_B := 3
const ST_DASH_F := 4
const ST_DASH_B := 5
const ST_RUN := 6
const ST_RUN_STOP := 7
const ST_EVADE := 8
const ST_GUARD := 9
const ST_MOVE := 10
const ST_THROWING := 11
const ST_THROWN := 12
const ST_BLOCKSTUN := 13
const ST_HITSTUN := 14
const ST_STAGGER := 15
const ST_CRUMPLE := 16
const ST_AIR := 17
const ST_WALL := 18
const ST_DOWN := 19
const ST_GETUP := 20
const ST_TECH := 21
const ST_BACKTURN := 22
const ST_STANCE := 23
const ST_RINGOUT := 24
const ST_KO := 25
const ST_STAND_UP := 26
const ST_TURN := 27
const ST_CLASH := 28
const ST_WIN := 29
const ST_LOSE := 30
const ST_CROUCH_IN := 31
const ST_PARRIED := 32

const STATE_NAMES: Array[String] = [
	"STAND", "CROUCH", "WALK_F", "WALK_B", "DASH_F", "DASH_B", "RUN", "RUN_STOP", "EVADE", "GUARD",
	"MOVE", "THROWING", "THROWN", "BLOCKSTUN", "HITSTUN", "STAGGER", "CRUMPLE", "AIR", "WALL", "DOWN",
	"GETUP", "TECH", "BACKTURN", "STANCE", "RINGOUT", "KO", "STAND_UP", "TURN", "CLASH", "WIN",
	"LOSE", "CROUCH_IN", "PARRIED",
]

# 攻撃の段
const LV_HIGH := 0
const LV_MID := 1
const LV_LOW := 2
const LV_SMID := 3
const LV_THROW := 4
const LV_LTHROW := 5
const LV_DOWN := 6
const LV_PARRY := 7
const LV_NONE := 8
const LEVEL_NAMES: Array[String] = ["high", "mid", "low", "smid", "throw", "lthrow", "down", "parry", "none"]

# 部位
const LIMB_PUNCH := 0
const LIMB_ELBOW := 1
const LIMB_KICK := 2
const LIMB_KNEE := 3
const LIMB_HEAD := 4
const LIMB_BODY := 5
const LIMB_NAMES: Array[String] = ["punch", "elbow", "kick", "knee", "head", "body"]

# 追尾
const TRK_LINEAR := 0
const TRK_HALF_L := 1
const TRK_HALF_R := 2
const TRK_FULL := 3
const TRACK_NAMES: Array[String] = ["linear", "half_left", "half_right", "full"]

# 強さ
const W_LIGHT := 0
const W_MEDIUM := 1
const W_HEAVY := 2
const W_LAUNCH := 3
const WEIGHT_NAMES: Array[String] = ["light", "medium", "heavy", "launch"]

# 被弾リアクション（ヒット時の結果）
const R_NONE := -1
const R_HIGH_LIGHT := 0
const R_HIGH_HEAVY := 1
const R_MID_LIGHT := 2
const R_MID_HEAVY := 3
const R_LOW := 4
const R_STAGGER_GUT := 5
const R_STAGGER_LEG := 6
const R_CRUMPLE := 7
const R_KNOCKBACK := 8
const R_SPIN := 9
const R_TRIP := 10
const R_LAUNCH := 11
const R_LAUNCH_SPIN := 12
const R_WALLSPLAT := 13
const R_TURN := 14
const R_GUARD_CRUSH := 15
const REACTION_NAMES: Array[String] = [
	"high_light", "high_heavy", "mid_light", "mid_heavy", "low", "stagger_gut", "stagger_leg",
	"crumple", "knockback", "spin", "trip", "launch", "launch_spin", "wall_splat", "turn", "guard_crush",
]

## 硬直（のけぞり）で終わるリアクションか
static func is_stun_reaction(r: int) -> bool:
	return r == R_HIGH_LIGHT or r == R_HIGH_HEAVY or r == R_MID_LIGHT or r == R_MID_HEAVY or r == R_LOW or r == R_TURN


static func is_air_reaction(r: int) -> bool:
	return r == R_KNOCKBACK or r == R_SPIN or r == R_TRIP or r == R_LAUNCH or r == R_LAUNCH_SPIN or r == R_WALLSPLAT


# ダウンの向き（DOWN の sub）
const DOWN_UP := 0      # 仰向け
const DOWN_FACE := 1    # うつ伏せ

# 起き上がり（GETUP の sub）
const GU_INPLACE := 0
const GU_ROLL_L := 1
const GU_ROLL_R := 2
const GU_ROLL_BACK := 3

# 受け身（TECH の sub）
const TECH_INPLACE := 0
const TECH_L := 1
const TECH_R := 2
const TECH_BACK := 3

# 空中の種類（AIR の sub）
const AIR_LAUNCH := 0
const AIR_SPIN := 1
const AIR_KNOCK := 2
const AIR_TRIP := 3

# 技フラグ（ビット）
const F_GUARD_CRUSH := 1
const F_WALL_SPLAT := 2
const F_WALL_BREAK := 4
const F_NO_TECH := 8
const F_HITS_DOWN := 16
const F_CAN_RINGOUT := 32
const F_CINEMATIC := 64
const F_WALL_ONLY := 128
const F_END_CROUCH := 256
const F_END_BACKTURN := 512
const F_HITS_AIR_ONLY := 1024
const FLAG_NAMES: Array[String] = [
	"guard_crush", "wall_splat", "wall_break", "no_tech", "hits_down", "can_ringout",
	"cinematic", "wall_only", "end_crouch", "end_backturn", "hits_air_only",
]

# 姿勢フラグ（技の posture 区間）
const P_LOW_PROFILE := 1
const P_AIRBORNE := 2
const P_STRIKE_INV := 4
const P_THROW_INV := 8
const P_FULL_INV := 16
const POSTURE_NAMES: Array[String] = ["low_profile", "airborne", "strike_invuln", "throw_invuln", "full_invuln"]

# 技が出せる状態（from のビット）
const FROM_STAND := 1
const FROM_CROUCH := 2
const FROM_RISE := 4
const FROM_DASH := 8
const FROM_RUN := 16
const FROM_EVADE := 32
const FROM_BACKTURN := 64
const FROM_DOWN := 128
const FROM_STANCE := 256
const FROM_OPP_DOWN := 512
const FROM_WALL := 1024
const FROM_NAMES: Array[String] = ["stand", "crouch", "rise", "dash", "run", "evade", "backturn", "down", "stance", "opp_down", "wall"]

# 連携の条件
const CH_ANY := 0
const CH_HIT := 1
const CH_CONTACT := 2

# 技の接触結果（move_contact）
const MC_NONE := 0
const MC_HIT := 1
const MC_BLOCK := 2
const MC_WHIFF_EVADE := 3
const MC_PARRIED := 4

# 投げ抜け方向
const ESC_N := 0
const ESC_BACK := 1
const ESC_FWD := 2
const ESC_DOWN := 3
const ESC_NONE := 9

# 投げの相対位置
const TA_FRONT := 0
const TA_SIDE := 1
const TA_BACK := 2

# 試合フェーズ
const PH_INTRO := 0
const PH_FIGHT := 1
const PH_ROUND_END := 2
const PH_MATCH_END := 3

# 決着理由
const END_KO := 0
const END_RINGOUT := 1
const END_TIMEUP := 2
const END_DRAW := 3

# 境界の種類
const EDGE_OPEN := 0
const EDGE_FENCE := 1
const EDGE_WALL := 2
const EDGE_BREAKABLE := 3
