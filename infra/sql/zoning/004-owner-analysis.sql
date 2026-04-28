-- Owner analysis: classify owner types, compute multi-parcel/absentee/public flags

BEGIN;

TRUNCATE property.parcel_owner_analysis;

-- Owner type classification using heuristic pattern matching on owner name
INSERT INTO property.parcel_owner_analysis (
    parcel_id, owner_name_normalized, owner_type,
    multi_parcel_owner_flag, parcel_count_same_owner,
    public_owner_flag, computed_at
)
WITH owner_counts AS (
    SELECT UPPER(TRIM(owner)) AS owner_norm, COUNT(*) AS cnt
    FROM public.ebr_parcels
    WHERE owner IS NOT NULL AND TRIM(owner) != ''
    GROUP BY UPPER(TRIM(owner))
)
SELECT
    p.id AS parcel_id,
    UPPER(TRIM(p.owner)) AS owner_name_normalized,
    CASE
        -- Government / public
        WHEN UPPER(p.owner) ~* '(STATE OF|CITY OF|PARISH OF|UNITED STATES|USA|U\.S\.|DEPT OF|DEPARTMENT|BREC|BOARD OF|SCHOOL BOARD|LSU|LOUISIANA STATE|HOUSING AUTHORITY|REDEVELOPMENT|PUBLIC|MUNICIPAL|FEDERAL|COUNTY|METRO COUNCIL|SEWERAGE|WATER DISTRICT|DRAINAGE|FIRE DISTRICT|SHERIFF|POLICE|HIGHWAY|DOT[D]?)' THEN 'government'
        -- Church / religious
        WHEN UPPER(p.owner) ~* '(CHURCH|BAPTIST|METHODIST|CATHOLIC|EPISCOPAL|PRESBYTERIAN|PENTECOSTAL|ASSEMBLY OF GOD|CONGREGATION|MINISTRY|MINISTRIES|SYNAGOGUE|MOSQUE|TEMPLE|DIOCESE|ARCHDIOCESE|RELIGIOUS|FAITH|GOSPEL|APOSTOLIC|AME |COGIC|HOLINESS|SEVENTH DAY|ADVENTIST|JEHOVAH|LATTER DAY|MORMON|ISLAMIC|BUDDHIST)' THEN 'church'
        -- Trust
        WHEN UPPER(p.owner) ~* '(TRUST|TRUSTEE|IRREVOCABLE|REVOCABLE|LIVING TRUST|FAMILY TRUST|TESTAMENTARY)' THEN 'trust'
        -- LLC / corporate entity
        WHEN UPPER(p.owner) ~* '(LLC|L\.L\.C|INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|LP|L\.P\.|PARTNERSHIP|COMPANY|ENTERPRISES|PROPERTIES|HOLDINGS|DEVELOPMENT|INVESTMENTS|ASSOCIATES|GROUP|VENTURES|REALTY|REAL ESTATE|CAPITAL|MANAGEMENT|CONSTRUCTION|BUILDERS|HOMES)' THEN 'llc'
        -- Individual (everything else with a name)
        WHEN p.owner IS NOT NULL AND TRIM(p.owner) != '' THEN 'individual'
        ELSE 'unknown'
    END AS owner_type,
    COALESCE(oc.cnt > 1, false) AS multi_parcel_owner_flag,
    COALESCE(oc.cnt, 0) AS parcel_count_same_owner,
    UPPER(p.owner) ~* '(STATE OF|CITY OF|PARISH OF|UNITED STATES|USA|U\.S\.|DEPT OF|DEPARTMENT|BREC|BOARD OF|SCHOOL BOARD|LSU|LOUISIANA STATE|HOUSING AUTHORITY|REDEVELOPMENT|PUBLIC|MUNICIPAL|FEDERAL|COUNTY|METRO COUNCIL|SEWERAGE|WATER DISTRICT|DRAINAGE|FIRE DISTRICT|SHERIFF|POLICE|HIGHWAY|DOT[D]?)' AS public_owner_flag,
    now() AS computed_at
FROM public.ebr_parcels p
LEFT JOIN owner_counts oc ON UPPER(TRIM(p.owner)) = oc.owner_norm;

COMMIT;
