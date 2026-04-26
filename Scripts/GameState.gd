extends Node

var money : float = 1000000
var money_change = -500
var population : int = 0
var days : int = 1
var ministers : Dictionary = {}
var ideology : String = ""
var pending_application : Array = []
var international_reputation : int = 0
var raw_pioneers : Array = []
var application : Dictionary = {}
var pioneers : Array = []



func _ready():
	var file = FileAccess.open("res://data/applicants.json", FileAccess.READ)
	var json_string = file.get_as_text()
	raw_pioneers = JSON.parse_string(json_string)


func GeneratePioneerApplication():
	if raw_pioneers != []:
		application = raw_pioneers.pop_at(randi() % raw_pioneers.size())
