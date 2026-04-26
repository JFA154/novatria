extends Control

@onready var app_name = $VBoxContainer/Name
@onready var skills = $VBoxContainer/Skills
@onready var ideology = $VBoxContainer/Ideology
@onready var country = $VBoxContainer/Country
@onready var wage_demand = $VBoxContainer/WageDemand
signal dismissed

var dragging = false
var drag_offset = Vector2()



func _ready():
	app_name.text = GameState.application["name"]
	skills.text = GameState.application["country"]
	ideology.text = GameState.application["ideology"]
	country.text = ", ".join(GameState.application["skills"])
	wage_demand.text = "£" + str(int(GameState.application["wage_demand"]))


func _on_accept_btn_pressed():
	GameState.pioneers.append(GameState.application)
	GameState.population += 1
	dismissed.emit()
	queue_free()

func _on_reject_btn_pressed():
	dismissed.emit()
	queue_free()
	
func _gui_input(event):
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			dragging = event.pressed
			drag_offset = global_position - get_global_mouse_position()
	
	if event is InputEventMouseMotion and dragging:
		global_position = get_global_mouse_position() + drag_offset
