/**
 * SQL Queries
 * ===========
 * Centralized query definitions for inventory and procurement modules.
 */

// ─── Warehouse Wise Inventory (MSSQL / SAP B1) ──────────────────────────────

export const WAREHOUSE_WISE_INVENTORY = `
SELECT
    T0.ItemCode,
    T0.ItemName AS [Description],
    T1.ItmsGrpNam AS [Item Group],
    T2.WhsCode AS [Warehouse Code],
    T3.WhsName AS [Warehouse Name],
    CAST(T2.OnHand AS DECIMAL(19,2)) AS [Warehouse Qty],
    CAST(T2.IsCommited AS DECIMAL(19,2)) AS [Committed Qty],
    CAST(T2.OnOrder AS DECIMAL(19,2)) AS [On Order Qty],
    CAST(T2.OnHand - T2.IsCommited + T2.OnOrder AS DECIMAL(19,2)) AS [Available Qty]
FROM OITW T2 WITH (NOLOCK)
INNER JOIN OITM T0 WITH (NOLOCK) ON T0.ItemCode = T2.ItemCode
INNER JOIN OITB T1 WITH (NOLOCK) ON T1.ItmsGrpCod = T0.ItmsGrpCod
INNER JOIN OWHS T3 WITH (NOLOCK) ON T3.WhsCode = T2.WhsCode
WHERE T2.OnHand <> 0
  AND T1.ItmsGrpNam = 'Raw Material'
  AND T3.WhsCode IN ('RM','Accept','QC')
ORDER BY T0.ItemCode, T2.WhsCode
`;

// ─── BOM Pivot – All RV Bikes (MSSQL / SAP B1) ──────────────────────────────

export const BOM_PIVOT_RV_BIKES = `
DECLARE @Columns NVARCHAR(MAX);
DECLARE @SelectColumns NVARCHAR(MAX);
DECLARE @SQL NVARCHAR(MAX);

SELECT @Columns = STUFF((
    SELECT ',' + QUOTENAME(Name)
    FROM (SELECT DISTINCT Name FROM OITT WHERE Name LIKE '%RV%') B
    ORDER BY Name
    FOR XML PATH(''), TYPE
).value('.', 'NVARCHAR(MAX)'), 1, 1, '');

SELECT @SelectColumns = STUFF((
    SELECT ',ISNULL(' + QUOTENAME(Name) + ',0) AS ' + QUOTENAME(Name)
    FROM (SELECT DISTINCT Name FROM OITT WHERE Name LIKE '%RV%') B
    ORDER BY Name
    FOR XML PATH(''), TYPE
).value('.', 'NVARCHAR(MAX)'), 1, 1, '');

SET @SQL = '
SELECT
    [Part No],
    [Part Description],' + @SelectColumns + '
FROM (
    SELECT
        T0.Name AS BikeName,
        T1.Code AS [Part No],
        T2.ItemName AS [Part Description],
        T1.Quantity AS [BOM Qty]
    FROM OITT T0
    INNER JOIN ITT1 T1 ON T1.Father = T0.Code
    INNER JOIN OITM T2 ON T2.ItemCode = T1.Code
    WHERE T0.Name LIKE ''%RV%''
) AS SourceData
PIVOT (
    SUM([BOM Qty])
    FOR BikeName IN (' + @Columns + ')
) AS PivotTable
ORDER BY [Part No], [Part Description];';

EXEC sp_executesql @SQL;
`;

// ─── Production Plan – Bike-wise Monthly Breakdown (MySQL) ───────────────────

export const PRODUCTION_PLAN_MONTHLY = `
SELECT
    b.bike_name,
    SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=4 THEN p.planned_quantity ELSE 0 END) AS \`Apr-26\`,
    SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=5 THEN p.planned_quantity ELSE 0 END) AS \`May-26\`,
    SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=6 THEN p.planned_quantity ELSE 0 END) AS \`Jun-26\`,
    SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=7 THEN p.planned_quantity ELSE 0 END) AS \`Jul-26\`,
    SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=8 THEN p.planned_quantity ELSE 0 END) AS \`Aug-26\`,
    SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=9 THEN p.planned_quantity ELSE 0 END) AS \`Sep-26\`,
    SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=10 THEN p.planned_quantity ELSE 0 END) AS \`Oct-26\`,
    SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=11 THEN p.planned_quantity ELSE 0 END) AS \`Nov-26\`,
    SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=12 THEN p.planned_quantity ELSE 0 END) AS \`Dec-26\`,
    SUM(CASE WHEN p.plan_year=2027 AND p.plan_month=1 THEN p.planned_quantity ELSE 0 END) AS \`Jan-27\`,
    SUM(CASE WHEN p.plan_year=2027 AND p.plan_month=2 THEN p.planned_quantity ELSE 0 END) AS \`Feb-27\`,
    SUM(CASE WHEN p.plan_year=2027 AND p.plan_month=3 THEN p.planned_quantity ELSE 0 END) AS \`Mar-27\`,
    SUM(p.planned_quantity) AS Total
FROM bike b
LEFT JOIN production_plan p ON b.bike_id = p.bike_id
GROUP BY b.bike_id, b.bike_name
ORDER BY b.bike_id;
`;
