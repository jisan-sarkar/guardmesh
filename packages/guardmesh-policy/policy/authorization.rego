package guardmesh.authorization

default decision := {
	"allow": false,
	"reason": "action denied by policy",
	"policyVersion": "guardmesh-policy-v1",
}

decision := {
	"allow": true,
	"reason": "action permitted by policy",
	"policyVersion": "guardmesh-policy-v1",
} if allow

allow if {
	input.action == "order.create"
	input.resourceType == "order"
	input.actorRoles[_] == "cashier"
	locations_match
}

allow if {
	input.action == "order.read"
	input.resourceType == "order"
	input.actorRoles[_] == "cashier"
	locations_match
}

allow if {
	input.action == "order.read"
	input.resourceType == "order"
	input.actorRoles[_] == "manager"
	locations_match
}

allow if {
	input.action == "inventory.read"
	input.resourceType == "inventory"
	input.actorRoles[_] == "cashier"
	locations_match
}

allow if {
	input.action == "inventory.read"
	input.resourceType == "inventory"
	input.actorRoles[_] == "manager"
	locations_match
}

allow if {
	input.action == "inventory.catalogue.read"
	input.resourceType == "inventory"
	input.actorRoles[_] == "inventory-reader"
	locations_match
}

allow if {
	input.action == "inventory.adjust"
	input.resourceType == "inventory"
	input.actorRoles[_] == "manager"
	locations_match
}

locations_match if {
	input.actorLocationId == input.resourceLocationId
}
