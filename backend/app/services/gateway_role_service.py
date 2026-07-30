VALID_GATEWAY_ROLES = {
    "admin",
    "manager",
    "recruiter",
    "interviewer",
    "hr_director",
}


def normalize_employee_code(value):
    return str(value or "").strip().upper()


def parse_gateway_role_map(raw_value):
    mapping = {}
    for item in str(raw_value or "").split(","):
        employee_code, separator, role = item.partition(":")
        normalized_code = normalize_employee_code(employee_code)
        normalized_role = role.strip().lower()
        if separator and normalized_code and normalized_role in VALID_GATEWAY_ROLES:
            mapping[normalized_code] = normalized_role
    return mapping


def resolve_gateway_role(employee_code, raw_map, fallback="recruiter"):
    normalized_code = normalize_employee_code(employee_code)
    mapping = parse_gateway_role_map(raw_map)
    if normalized_code in mapping:
        return mapping[normalized_code], True

    normalized_fallback = str(fallback or "").strip().lower()
    if normalized_fallback not in VALID_GATEWAY_ROLES:
        normalized_fallback = "recruiter"
    return normalized_fallback, False
