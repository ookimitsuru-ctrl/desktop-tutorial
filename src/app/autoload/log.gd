extends Node
## ログ（user://logs/ に保存、最大 5 ファイル）

var _file: FileAccess = null


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute("user://logs")
	var d := DirAccess.open("user://logs")
	if d != null:
		var files := d.get_files()
		files.sort()
		while files.size() > 4:
			d.remove(files[0])
			files.remove_at(0)
	var stamp := Time.get_datetime_string_from_system().replace(":", "-")
	_file = FileAccess.open("user://logs/log_%s.txt" % stamp, FileAccess.WRITE)


func info(msg: String) -> void:
	_write("I", msg)


func warn(msg: String) -> void:
	_write("W", msg)
	push_warning(msg)


func error(msg: String) -> void:
	_write("E", msg)
	push_error(msg)


func _write(level: String, msg: String) -> void:
	var line := "[%s %s] %s" % [level, Time.get_time_string_from_system(), msg]
	print(line)
	if _file != null:
		_file.store_line(line)
		_file.flush()
