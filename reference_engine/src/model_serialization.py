"""Serializes a loaded ModelStructure into the JSON shape the API and plugins use."""


def model_to_dict(model) -> dict:
    metadata = {
        "name": model.metadata.name if model.metadata else "",
        "version": model.metadata.version if model.metadata else "",
        "author": model.metadata.author if model.metadata else "",
        "description": model.metadata.description if model.metadata else ""
    }
    variables = {
        var_name: {
            "description": var.description, "value": var.value, "unit": var.unit,
            "type": var.type.value if hasattr(var.type, 'value') else str(var.type),
            "reference": var.reference,
            "locator": var.locator,
            "evidence_type": var.evidence_type,
            "evidence_raw_value": var.evidence_raw_value,
        }
        for var_name, var in model.variables.items()
    }
    equations = {
        f_name: {
            "description": f.description, "condition": f.condition,
            "priority": f.priority, "dynamics": f.dynamics,
            "reference": f.reference, "locator": f.locator,
        }
        for f_name, f in model.equations.items()
    }
    provenance = getattr(model, 'provenance', {}) or {}
    return {
        "metadata": metadata, "variables": variables, "equations": equations,
        "simulation": model.simulator,
        "optimization": model.optimizer,
        "plans": model.plans,
        "imports": provenance.get('imports', []),
        "provenance": provenance, "resolved": True,
    }
