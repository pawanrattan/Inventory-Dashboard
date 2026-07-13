-- ============================================================================
-- COMPLETE BOM QUERIES FOR ALL BIKES
-- Combines Semi-Finished BOM + Finished BOM parts for each bike model
-- ============================================================================

-- ============================================================================
-- QUERY 1: List all Finished Bikes and their corresponding Semi-Finished codes
-- ============================================================================
SELECT 
    T0.Code AS [FG Code],
    T0.Name AS [FG Description],
    T1.Code AS [SFG Code],
    T1.ItemName AS [SFG Description]
FROM OITT T0 WITH (NOLOCK)
INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
WHERE T0.Code NOT LIKE '%_SFG'
  AND T1.Code LIKE '%_SFG'
  AND T0.TreeType = 'P'
ORDER BY T0.Code


-- ============================================================================
-- QUERY 2: Complete BOM for ALL Finished Bikes (all parts combined)
-- Returns deduplicated part list per FG bike with quantities summed
-- ============================================================================
;WITH All_FG_Bikes AS (
    -- Identify all Finished Goods bikes that have a Semi-Finished component
    SELECT 
        T0.Code AS FGCode,
        T0.Name AS FGName,
        T1.Code AS SFGCode
    FROM OITT T0 WITH (NOLOCK)
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
    WHERE T0.Code NOT LIKE '%_SFG'
      AND T1.Code LIKE '%_SFG'
      AND T0.TreeType = 'P'
),
SFG_Parts AS (
    -- Get all parts from each Semi-Finished bike's BOM
    SELECT 
        FG.FGCode,
        FG.FGName,
        T1.Code AS [ComponentCode],
        T1.ItemName AS [ComponentDescription],
        T1.Quantity AS [ComponentQty],
        T1.IssueMthd AS [IssueMethod],
        'Semi-Finished BOM' AS [Source]
    FROM All_FG_Bikes FG
    INNER JOIN OITT T0 WITH (NOLOCK) ON T0.Code = FG.SFGCode
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
),
FG_Parts AS (
    -- Get additional parts from the Finished bike BOM (excluding the SFG item)
    SELECT 
        FG.FGCode,
        FG.FGName,
        T1.Code AS [ComponentCode],
        T1.ItemName AS [ComponentDescription],
        T1.Quantity AS [ComponentQty],
        T1.IssueMthd AS [IssueMethod],
        'Finished BOM' AS [Source]
    FROM All_FG_Bikes FG
    INNER JOIN OITT T0 WITH (NOLOCK) ON T0.Code = FG.FGCode
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
    WHERE T1.Code NOT LIKE '%_SFG'
),
Combined AS (
    SELECT * FROM SFG_Parts
    UNION ALL
    SELECT * FROM FG_Parts
)
SELECT 
    FGCode AS [FG Code],
    FGName AS [FG Description],
    ComponentCode AS [Component Code],
    ComponentDescription AS [Component Description],
    SUM(ComponentQty) AS [Total Required Qty],
    MAX(IssueMethod) AS [Issue Method],
    CASE 
        WHEN COUNT(*) > 1 THEN 'Both'
        ELSE MAX([Source])
    END AS [Source]
FROM Combined
GROUP BY FGCode, FGName, ComponentCode, ComponentDescription
ORDER BY FGCode, [Source], ComponentCode


-- ============================================================================
-- QUERY 3: Complete BOM for a SPECIFIC bike model family
-- Change the @ModelPrefix to filter by model
-- Examples: 'RMC400%' (RV400), 'RM2AW1%' (RV1+), 'RM3AW1%' (Blaze X),
--           'RM1AW1%' (RV1), 'RM1AY3%' (RVX)
-- ============================================================================
DECLARE @ModelPrefix NVARCHAR(50) = 'RMC400%'  -- Change this for different models

;WITH Model_FG_Bikes AS (
    SELECT 
        T0.Code AS FGCode,
        T0.Name AS FGName,
        T1.Code AS SFGCode
    FROM OITT T0 WITH (NOLOCK)
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
    WHERE T0.Code LIKE @ModelPrefix
      AND T0.Code NOT LIKE '%_SFG'
      AND T1.Code LIKE '%_SFG'
      AND T0.TreeType = 'P'
),
SFG_Parts AS (
    SELECT 
        FG.FGCode,
        FG.FGName,
        T1.Code AS [ComponentCode],
        T1.ItemName AS [ComponentDescription],
        T1.Quantity AS [ComponentQty],
        T1.IssueMthd AS [IssueMethod],
        'Semi-Finished BOM' AS [Source]
    FROM Model_FG_Bikes FG
    INNER JOIN OITT T0 WITH (NOLOCK) ON T0.Code = FG.SFGCode
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
),
FG_Parts AS (
    SELECT 
        FG.FGCode,
        FG.FGName,
        T1.Code AS [ComponentCode],
        T1.ItemName AS [ComponentDescription],
        T1.Quantity AS [ComponentQty],
        T1.IssueMthd AS [IssueMethod],
        'Finished BOM' AS [Source]
    FROM Model_FG_Bikes FG
    INNER JOIN OITT T0 WITH (NOLOCK) ON T0.Code = FG.FGCode
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
    WHERE T1.Code NOT LIKE '%_SFG'
),
Combined AS (
    SELECT * FROM SFG_Parts
    UNION ALL
    SELECT * FROM FG_Parts
)
SELECT 
    FGCode AS [FG Code],
    FGName AS [FG Description],
    ComponentCode AS [Component Code],
    ComponentDescription AS [Component Description],
    SUM(ComponentQty) AS [Total Required Qty],
    MAX(IssueMethod) AS [Issue Method],
    CASE 
        WHEN COUNT(*) > 1 THEN 'Both'
        ELSE MAX([Source])
    END AS [Source]
FROM Combined
GROUP BY FGCode, FGName, ComponentCode, ComponentDescription
ORDER BY FGCode, [Source], ComponentCode


-- ============================================================================
-- QUERY 4: Summary - Count of parts per FG bike (SFG parts + FG parts)
-- ============================================================================
;WITH All_FG_Bikes AS (
    SELECT 
        T0.Code AS FGCode,
        T0.Name AS FGName,
        T1.Code AS SFGCode
    FROM OITT T0 WITH (NOLOCK)
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
    WHERE T0.Code NOT LIKE '%_SFG'
      AND T1.Code LIKE '%_SFG'
      AND T0.TreeType = 'P'
),
SFG_Part_Count AS (
    SELECT 
        FG.FGCode,
        COUNT(T1.Code) AS SFGPartCount
    FROM All_FG_Bikes FG
    INNER JOIN OITT T0 WITH (NOLOCK) ON T0.Code = FG.SFGCode
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
    GROUP BY FG.FGCode
),
FG_Part_Count AS (
    SELECT 
        FG.FGCode,
        COUNT(T1.Code) - 1 AS FGPartCount  -- Minus 1 to exclude the SFG item itself
    FROM All_FG_Bikes FG
    INNER JOIN OITT T0 WITH (NOLOCK) ON T0.Code = FG.FGCode
    INNER JOIN ITT1 T1 WITH (NOLOCK) ON T1.Father = T0.Code
    GROUP BY FG.FGCode
)
SELECT 
    FG.FGCode AS [FG Code],
    FG.FGName AS [FG Description],
    FG.SFGCode AS [SFG Code],
    ISNULL(S.SFGPartCount, 0) AS [Semi-Finished Parts Count],
    ISNULL(F.FGPartCount, 0) AS [Finished-Level Parts Count],
    ISNULL(S.SFGPartCount, 0) + ISNULL(F.FGPartCount, 0) AS [Total Unique Parts]
FROM All_FG_Bikes FG
LEFT JOIN SFG_Part_Count S ON S.FGCode = FG.FGCode
LEFT JOIN FG_Part_Count F ON F.FGCode = FG.FGCode
ORDER BY FG.FGCode


-- ============================================================================
-- QUERY 5: Identify all bike models grouped by family
-- ============================================================================
SELECT 
    CASE 
        WHEN T0.Code LIKE 'RM0300%' THEN 'RV300'
        WHEN T0.Code LIKE 'RM0400RRCK0%' THEN 'RV400 BRZ'
        WHEN T0.Code LIKE 'RM0400RRCP1%' THEN 'RV400'
        WHEN T0.Code LIKE 'RMC400RRCK0%' THEN 'RV400 BRZ (New)'
        WHEN T0.Code LIKE 'RMC400RRCP1%' THEN 'RV400 (New)'
        WHEN T0.Code LIKE 'RM1AW1%' THEN 'RV1'
        WHEN T0.Code LIKE 'RM2AW1RRCK0%' THEN 'RV1+'
        WHEN T0.Code LIKE 'RM2AW1DDCK0%' THEN 'RV1+ (DD)'
        WHEN T0.Code LIKE 'RM3AW1%' THEN 'RV Blaze X'
        WHEN T0.Code LIKE 'RM1AY3%' THEN 'RVX'
        ELSE 'Other'
    END AS [Model Family],
    T0.Code AS [Item Code],
    T0.Name AS [Item Description],
    CASE 
        WHEN T0.Code LIKE '%_SFG' THEN 'Semi-Finished'
        ELSE 'Finished Goods'
    END AS [Type],
    T0.ToWH AS [Warehouse]
FROM OITT T0 WITH (NOLOCK)
WHERE T0.TreeType = 'P'
  AND (
    T0.Code LIKE 'RM0300%'
    OR T0.Code LIKE 'RM0400%'
    OR T0.Code LIKE 'RMC400%'
    OR T0.Code LIKE 'RM1AW1%'
    OR T0.Code LIKE 'RM2AW1%'
    OR T0.Code LIKE 'RM3AW1%'
    OR T0.Code LIKE 'RM1AY3%'
  )
ORDER BY [Model Family], [Type], T0.Code
