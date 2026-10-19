/** "floor-plan.PDF" -> "PDF"; unknown -> "File". */
export const fileTypeLabel = (name: string): string => {
  const ext = name.split(".").pop();
  return ext && ext !== name && ext.length <= 5 ? ext.toUpperCase() : "File";
};
