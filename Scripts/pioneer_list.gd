extends Panel

@onready var name_container = $HBoxContainer/NameContainer
@onready var info_container = $HBoxContainer/InfoContainer

func refresh():
	for child in name_container.get_children():
		child.free()
		
	for i in GameState.pioneers:
		var btn = Button.new()
		btn.text = i["name"]
		btn.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
		btn.pressed.connect(_on_pioneer_pressed.bind(i))
		name_container.add_child(btn)


func _on_exit_list_btn_pressed() -> void:
	visible = false
	
	for child in info_container.get_children():
		child.queue_free()
	
func _on_pioneer_pressed(pioneer):
	for child in info_container.get_children():
		child.free()
		
	for key in pioneer:
		var label = Label.new()
		
		#if pioneer[key] is Array:
			#pioneer[key] = ", ".join(pioneer[key])
		#
		#if key == "name":
			#label.text = pioneer[key]
		#elif key == "wage_demand":
			#label.text = "£" + str(int(pioneer[key]))
		#elif pioneer[key] is float and pioneer[key] == int(pioneer[key]):
			#label.text = key + ": " + str(int(pioneer[key]))
		#else:
			#label.text = key + ": " + str(pioneer[key])
		
		label.text = PioneerInfo(key, pioneer)
		info_container.add_child(label)
		
func PioneerInfo(key, pioneer):
	if pioneer[key] is Array:
		return ", ".join(pioneer[key])
		
	if key == "name":
		return pioneer[key]
	elif key == "wage_demand":
		return "£" + str(int(pioneer[key]))
	elif pioneer[key] is float and pioneer[key] == int(pioneer[key]):
		return key + ": " + str(int(pioneer[key]))
	else:
		return key + ": " + str(pioneer[key])
