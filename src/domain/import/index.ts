// Public entry of the import module. The XLSX reader (./xlsx) is not re-exported here on purpose:
// load it on demand with `await import('./xlsx')` so the xlsx package stays out of the main bundle.
export { importSheetRows, importSheetText, looksLikeSheet, COLUMNS } from './sheet'
export type { SheetPlanInfo } from './sheet'
export { parseCsv } from './csv'
