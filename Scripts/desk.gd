extends Control

@onready var MoneyDisplay = $MoneyDisplay
@onready var DayPassed = $DayPassed
@onready var PopulationNumber = $PopulationNumber
@onready var PioneerList = $PioneerList

var application_form = preload("res://Scenes/ApplicationForm.tscn")
var active_documents : Array = []

@export var max_app_per_day : int = 2

func _ready():
	GameState.GeneratePioneerApplication()
	var instance = application_form.instantiate()
	add_child(instance)
	instance.position = Vector2(210, 120)
	active_documents.append(instance)
	instance.dismissed.connect(NullifyCD.bind(instance))
	$NextDayBtn.disabled = true
	PioneerList.visible = false

func _process(delta):
	var CurrentMoney = "%.2f" % GameState.money
	MoneyDisplay.text = "£" + CurrentMoney
	DayPassed.text = "Day: " + str(GameState.days)
	PopulationNumber.text = "Population: " + str(GameState.population)



func NullifyCD(instance):
	active_documents.erase(instance)
	if active_documents == []:
		$NextDayBtn.disabled = false


func _on_NextDayBtn_pressed() -> void:
	GameState.money -= 10
	GameState.days += 1
	
	var number_of_app : int = randi() % (max_app_per_day + 1)
	
	for i in number_of_app:
		GameState.GeneratePioneerApplication()
			
		var instance = application_form.instantiate()
		add_child(instance)
		instance.position = Vector2(210 + active_documents.size() * 10, 120 + active_documents.size() * 10)
		active_documents.append(instance)
		instance.dismissed.connect(NullifyCD.bind(instance))
	
	if active_documents != []:
		$NextDayBtn.disabled = true
	


func _on_pioneers_disp_btn_pressed():
	PioneerList.refresh()
	PioneerList.visible = true
