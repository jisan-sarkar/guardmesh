package guardmesh.authorization

test_cashier_can_create_order if {
	decision := data.guardmesh.authorization.decision with input as {
		"actorRoles": ["cashier"],
		"actorLocationId": "loc-a",
		"action": "order.create",
		"resourceType": "order",
		"resourceId": "order-1",
		"resourceLocationId": "loc-a",
	}
	decision.allow
}

test_cashier_cannot_adjust_inventory if {
	decision := data.guardmesh.authorization.decision with input as {
		"actorRoles": ["cashier"],
		"actorLocationId": "loc-a",
		"action": "inventory.adjust",
		"resourceType": "inventory",
		"resourceId": "item-1",
		"resourceLocationId": "loc-a",
	}
	not decision.allow
}

test_cross_location_read_is_denied if {
	decision := data.guardmesh.authorization.decision with input as {
		"actorRoles": ["manager"],
		"actorLocationId": "loc-a",
		"action": "order.read",
		"resourceType": "order",
		"resourceId": "order-1",
		"resourceLocationId": "loc-b",
	}
	not decision.allow
}

test_unknown_action_is_denied if {
	decision := data.guardmesh.authorization.decision with input as {
		"actorRoles": ["manager"],
		"actorLocationId": "loc-a",
		"action": "order.delete",
		"resourceType": "order",
		"resourceId": "order-1",
		"resourceLocationId": "loc-a",
	}
	not decision.allow
}

test_inventory_reader_can_read_catalogue if {
	decision := data.guardmesh.authorization.decision with input as {
		"actorRoles": ["inventory-reader"],
		"actorLocationId": "loc-a",
		"action": "inventory.catalogue.read",
		"resourceType": "inventory",
		"resourceId": "loc-a",
		"resourceLocationId": "loc-a",
	}
	decision.allow
}

test_manager_cannot_use_catalogue_action if {
	decision := data.guardmesh.authorization.decision with input as {
		"actorRoles": ["manager"],
		"actorLocationId": "loc-a",
		"action": "inventory.catalogue.read",
		"resourceType": "inventory",
		"resourceId": "loc-a",
		"resourceLocationId": "loc-a",
	}
	not decision.allow
}
