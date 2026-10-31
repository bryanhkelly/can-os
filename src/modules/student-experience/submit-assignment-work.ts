/** Coordinate existing draft, attachment and submission commands.
 * Failed uploads leave the attempt editable; only a fully attached draft is submitted.
 */
export async function saveAssignmentWork<File, Receipt>(input: {
  files: readonly File[];
  saveDraft: () => Promise<Receipt>;
  attach: (file: File) => Promise<unknown>;
  attached: (file: File) => void;
}): Promise<Receipt> {
  const receipt = await input.saveDraft();
  for (const file of input.files) {
    await input.attach(file);
    input.attached(file);
  }
  return receipt;
}

export async function submitAssignmentWork<File, Receipt>(input: {
  files: readonly File[];
  saveDraft: () => Promise<unknown>;
  attach: (file: File) => Promise<unknown>;
  attached: (file: File) => void;
  submit: () => Promise<Receipt>;
}): Promise<Receipt> {
  await saveAssignmentWork(input);
  return input.submit();
}
