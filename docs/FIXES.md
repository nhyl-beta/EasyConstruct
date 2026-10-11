# Fixes applied

- Standardized project risk values to the lowercase enum used by the shared project model (`low`, `medium`, `high`).
- Updated the project creation form to use the lowercase risk values and keep the Select values consistent with the model.
- Fixed the project detail page so it saves the risk value without converting it to an incompatible casing.
- Added the missing optional `assignedEngineer` field to the project type and normalized data mapping to match backend/mock data.
- Ensured repository-created project objects include the required `id` field, preventing missing-property TypeScript errors.
- Made project IDs compatible with both numeric API IDs and mock project IDs.
- Removed the remaining unsafe `any` usage from the project repository's mock normalization and payload handling.
- Fixed the engineer requirements page hook so its requirements are strongly typed, eliminating the implicit `any` callback parameter.
- Corrected the requirements controller to call the repository service's exported `findAll` and `findById` functions.
- Verified the client and server builds successfully.
