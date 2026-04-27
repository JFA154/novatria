class_name Character
extends Resource

@export_group("Identity")
@export var character_name : String
@export_multiline() var backstory : String
@export var portrait : Texture2D
@export var country : String
@export_group("")

@export_group("Stats")
@export_range(0, 100000, 1, "suffix:£") var wage_demand : int
enum Ideology {FAR_LEFT, LEFT, CENTRE, RIGHT, FAR_RIGHT}
@export var ideology : Ideology
## I want it to be between 0 and 100
@export_range(0, 100, 1, "suffix:%") var loyalty : int
