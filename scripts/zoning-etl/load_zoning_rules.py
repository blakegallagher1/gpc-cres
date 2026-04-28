#!/usr/bin/env python3
"""
ETL: Load EBR zoning rules from chatgpt-apps JSON into property DB.

Reads structured zoning JSON files and outputs SQL INSERT statements to stdout.
Pipe to: ssh bg "docker exec -i local-postgis psql -U postgres -d cres_db"
"""

import json
import os
import sys
from pathlib import Path

ZONING_DIR = Path("/Users/gallagherpropertycompany/Documents/chatgpt-apps/zoning/ebr")
DISTRICTS_DIR = ZONING_DIR / "districts"

def escape_sql(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val).replace("'", "''")
    return f"'{s}'"

def json_to_sql(val):
    if val is None:
        return "NULL"
    return escape_sql(json.dumps(val))

def category_to_group(category):
    if not category:
        return None
    c = category.lower()
    if any(k in c for k in ['single_family', 'residential', 'rural']):
        return 'residential'
    if any(k in c for k in ['commercial', 'business', 'office', 'neighborhood_commercial']):
        return 'commercial'
    if any(k in c for k in ['industrial', 'warehouse']):
        return 'industrial'
    if any(k in c for k in ['planned', 'pud', 'tnd']):
        return 'planned'
    if any(k in c for k in ['design', 'historic', 'overlay', 'special', 'government']):
        return 'special'
    return 'other'

def district_code_from_filename(filename):
    name = filename.replace("EBR_", "").replace(".json", "")
    return name.lower()

def load_districts():
    print("-- ========================================")
    print("-- Loading zoning districts and dimensional standards")
    print("-- ========================================")
    print()
    print("BEGIN;")
    print()
    print("TRUNCATE property.zoning_dimensional_standards CASCADE;")
    print("TRUNCATE property.zoning_districts CASCADE;")
    print()

    for json_file in sorted(DISTRICTS_DIR.glob("EBR_*.json")):
        with open(json_file) as f:
            data = json.load(f)

        code = data.get("id", district_code_from_filename(json_file.name))
        label = data.get("label", code.upper())
        category = data.get("category", "")
        group = category_to_group(category)
        notes = data.get("notes", "")

        print(f"INSERT INTO property.zoning_districts (district_code, label, category, zoning_group, notes, source_json)")
        print(f"VALUES ({escape_sql(code)}, {escape_sql(label)}, {escape_sql(category)}, {escape_sql(group)}, {escape_sql(notes)}, {json_to_sql(data)})")
        print(f"ON CONFLICT (district_code) DO UPDATE SET label=EXCLUDED.label, category=EXCLUDED.category, zoning_group=EXCLUDED.zoning_group, notes=EXCLUDED.notes, source_json=EXCLUDED.source_json;")
        print()

        standards = data.get("standards", {})
        if standards:
            emit_dimensional_row(code, "general", standards)

        for std_key in ["single_family_standards", "townhouse_standards", "multifamily_standards",
                        "residential_standards", "nonresidential_standards"]:
            std_data = data.get(std_key, {})
            if std_data and any(k for k in std_data if k not in ("notes",)):
                std_type = std_key.replace("_standards", "")
                emit_dimensional_row(code, std_type, std_data)

    print()
    print("COMMIT;")
    print()

def emit_dimensional_row(district_code, standard_type, data):
    def get_val(key):
        entry = data.get(key, {})
        if isinstance(entry, dict):
            return entry.get("value")
        return entry

    min_lot_area = get_val("min_lot_area")
    min_lot_width = get_val("min_lot_width_ft")
    front = get_val("setback_front_ft")
    side = get_val("setback_side_ft")
    corner = get_val("setback_corner_side_ft")
    rear = get_val("setback_rear_ft")
    height = get_val("max_height_ft") or get_val("height_max_ft")
    density = get_val("density_max_du_per_ac")
    coverage = get_val("max_lot_coverage")
    far = get_val("far")

    citation_parts = []
    for key in ["min_lot_area", "height_max_ft", "setback_front_ft"]:
        entry = data.get(key, {})
        if isinstance(entry, dict):
            for c in entry.get("citations", []):
                ref = c.get("ref", "")
                if ref and ref not in citation_parts:
                    citation_parts.append(ref)
    citation_ref = "; ".join(citation_parts) if citation_parts else None

    notes_val = data.get("notes") if isinstance(data.get("notes"), str) else None

    print(f"INSERT INTO property.zoning_dimensional_standards "
          f"(district_code, standard_type, min_lot_area_sf, min_lot_width_ft, "
          f"setback_front_ft, setback_side_ft, setback_corner_side_ft, setback_rear_ft, "
          f"max_height_ft, max_density_du_ac, max_lot_coverage, far, citation_ref, notes)")
    print(f"VALUES ({escape_sql(district_code)}, {escape_sql(standard_type)}, "
          f"{escape_sql(min_lot_area)}, {escape_sql(min_lot_width)}, "
          f"{escape_sql(front)}, {escape_sql(side)}, {escape_sql(corner)}, {escape_sql(rear)}, "
          f"{escape_sql(height)}, {escape_sql(density)}, {escape_sql(coverage)}, {escape_sql(far)}, "
          f"{escape_sql(citation_ref)}, {escape_sql(notes_val)})")
    print(f"ON CONFLICT (district_code, standard_type) DO UPDATE SET "
          f"min_lot_area_sf=EXCLUDED.min_lot_area_sf, min_lot_width_ft=EXCLUDED.min_lot_width_ft, "
          f"setback_front_ft=EXCLUDED.setback_front_ft, setback_side_ft=EXCLUDED.setback_side_ft, "
          f"setback_corner_side_ft=EXCLUDED.setback_corner_side_ft, setback_rear_ft=EXCLUDED.setback_rear_ft, "
          f"max_height_ft=EXCLUDED.max_height_ft, max_density_du_ac=EXCLUDED.max_density_du_ac, "
          f"max_lot_coverage=EXCLUDED.max_lot_coverage, far=EXCLUDED.far, "
          f"citation_ref=EXCLUDED.citation_ref, notes=EXCLUDED.notes;")
    print()

def load_use_permissions():
    print("-- ========================================")
    print("-- Loading use permissions matrix")
    print("-- ========================================")
    print()
    print("BEGIN;")
    print()
    print("TRUNCATE property.zoning_use_permissions;")
    print()

    with open(ZONING_DIR / "use_rules.json") as f:
        data = json.load(f)

    uses_meta = data.get("uses", {})
    district_matrix = data.get("district_matrix", {})

    count = 0
    for district_code, uses in district_matrix.items():
        for use_key, perm in uses.items():
            code = perm.get("code", "")
            citations = perm.get("citations", [])
            citation_ref = ", ".join(citations) if citations else None
            notes = perm.get("notes")
            use_label = uses_meta.get(use_key, {}).get("label", use_key)

            print(f"INSERT INTO property.zoning_use_permissions "
                  f"(district_code, use_key, use_label, permission_code, citation_ref, notes)")
            print(f"VALUES ({escape_sql(district_code)}, {escape_sql(use_key)}, {escape_sql(use_label)}, "
                  f"{escape_sql(code)}, {escape_sql(citation_ref)}, {escape_sql(notes)})")
            print(f"ON CONFLICT (district_code, use_key) DO UPDATE SET "
                  f"use_label=EXCLUDED.use_label, permission_code=EXCLUDED.permission_code, "
                  f"citation_ref=EXCLUDED.citation_ref, notes=EXCLUDED.notes;")
            count += 1

    print()
    print(f"-- Loaded {count} use permission entries")
    print("COMMIT;")
    print()

def load_parking_rules():
    print("-- ========================================")
    print("-- Loading parking rules")
    print("-- ========================================")
    print()
    print("BEGIN;")
    print()
    print("TRUNCATE property.zoning_parking_rules;")
    print()

    with open(ZONING_DIR / "parking_rules.json") as f:
        data = json.load(f)

    parking = data.get("parking", {})
    for use_type, areas in parking.items():
        for char_area, rules in areas.items():
            sf_per = rules.get("sf_per_space") or rules.get("office_sf_per_space")
            spu = rules.get("studio_1br_spaces_per_unit") or rules.get("per_guestroom")
            notes = rules.get("notes", "")
            citations = rules.get("citations", [])
            citation_ref = ", ".join(citations) if citations else None

            formula_parts = []
            if rules.get("sf_per_space"):
                formula_parts.append(f"1 per {rules['sf_per_space']} SF")
            if rules.get("office_sf_per_space"):
                formula_parts.append(f"1 per {rules['office_sf_per_space']} SF (office)")
            if rules.get("nonoffice_sf_per_space"):
                formula_parts.append(f"1 per {rules['nonoffice_sf_per_space']} SF (non-office)")
            if rules.get("studio_1br_spaces_per_unit"):
                formula_parts.append(f"{rules['studio_1br_spaces_per_unit']} per unit (studio/1BR)")
            if rules.get("per_guestroom"):
                formula_parts.append(f"{rules['per_guestroom']} per guestroom")
            if rules.get("base_spaces"):
                formula_parts.append(f"{rules['base_spaces']} base + 1 per {rules.get('spaces_per_100_units',100)} units")
            formula = "; ".join(formula_parts) if formula_parts else notes

            print(f"INSERT INTO property.zoning_parking_rules "
                  f"(use_type, character_area, spaces_formula, sf_per_space, spaces_per_unit, citation_ref, notes, raw_json)")
            print(f"VALUES ({escape_sql(use_type)}, {escape_sql(char_area)}, {escape_sql(formula)}, "
                  f"{escape_sql(sf_per)}, {escape_sql(spu)}, {escape_sql(citation_ref)}, "
                  f"{escape_sql(notes)}, {json_to_sql(rules)})")
            print(f"ON CONFLICT (use_type, character_area) DO UPDATE SET "
                  f"spaces_formula=EXCLUDED.spaces_formula, sf_per_space=EXCLUDED.sf_per_space, "
                  f"spaces_per_unit=EXCLUDED.spaces_per_unit, citation_ref=EXCLUDED.citation_ref, "
                  f"notes=EXCLUDED.notes, raw_json=EXCLUDED.raw_json;")
    print()
    print("COMMIT;")
    print()

def load_entitlement_paths():
    print("-- ========================================")
    print("-- Loading entitlement paths")
    print("-- ========================================")
    print()
    print("BEGIN;")
    print()
    print("TRUNCATE property.zoning_entitlement_paths;")
    print()

    with open(ZONING_DIR / "entitlement_paths.json") as f:
        data = json.load(f)

    for code, path_data in data.get("paths", {}).items():
        print(f"INSERT INTO property.zoning_entitlement_paths "
              f"(permission_code, label, path, approval_body, public_hearing, "
              f"estimated_timeline_weeks, estimated_cost_range, risk, notes)")
        print(f"VALUES ({escape_sql(code)}, {escape_sql(path_data.get('label'))}, "
              f"{escape_sql(path_data.get('path'))}, {escape_sql(path_data.get('approval_body'))}, "
              f"{escape_sql(path_data.get('public_hearing'))}, "
              f"{escape_sql(path_data.get('estimated_timeline_weeks'))}, "
              f"{escape_sql(path_data.get('estimated_cost_range'))}, "
              f"{escape_sql(path_data.get('risk'))}, {escape_sql(path_data.get('notes'))})")
        print(f"ON CONFLICT (permission_code) DO UPDATE SET "
              f"label=EXCLUDED.label, path=EXCLUDED.path, approval_body=EXCLUDED.approval_body, "
              f"public_hearing=EXCLUDED.public_hearing, estimated_timeline_weeks=EXCLUDED.estimated_timeline_weeks, "
              f"estimated_cost_range=EXCLUDED.estimated_cost_range, risk=EXCLUDED.risk, notes=EXCLUDED.notes;")

    dim_var = data.get("dimensional_variance", {})
    if dim_var:
        print(f"INSERT INTO property.zoning_entitlement_paths "
              f"(permission_code, label, path, approval_body, public_hearing, "
              f"estimated_timeline_weeks, estimated_cost_range, risk, notes)")
        print(f"VALUES ('V', {escape_sql(dim_var.get('label'))}, "
              f"{escape_sql(dim_var.get('path'))}, {escape_sql(dim_var.get('approval_body'))}, "
              f"{escape_sql(dim_var.get('public_hearing'))}, "
              f"{escape_sql(dim_var.get('estimated_timeline_weeks'))}, "
              f"{escape_sql(dim_var.get('estimated_cost_range'))}, "
              f"{escape_sql(dim_var.get('risk'))}, {escape_sql(dim_var.get('notes'))})")
        print(f"ON CONFLICT (permission_code) DO UPDATE SET "
              f"label=EXCLUDED.label, path=EXCLUDED.path, approval_body=EXCLUDED.approval_body, "
              f"public_hearing=EXCLUDED.public_hearing, estimated_timeline_weeks=EXCLUDED.estimated_timeline_weeks, "
              f"estimated_cost_range=EXCLUDED.estimated_cost_range, risk=EXCLUDED.risk, notes=EXCLUDED.notes;")

    print()
    print("COMMIT;")
    print()

if __name__ == "__main__":
    print("-- Auto-generated by load_zoning_rules.py")
    print(f"-- Source: {ZONING_DIR}")
    print()
    load_districts()
    load_use_permissions()
    load_parking_rules()
    load_entitlement_paths()
    print("-- Done loading zoning rules")
