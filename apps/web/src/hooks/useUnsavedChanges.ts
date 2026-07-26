import { Modal } from 'antd';
import type { FormInstance } from 'antd';

/**
 * Provides a `confirmClose` helper that shows an "Unsaved changes" Modal.confirm
 * only when the supplied form has been touched (or when `isDirty` is explicitly true).
 *
 * Usage:
 *   const { confirmClose } = useUnsavedChanges();
 *
 *   // In a Drawer onClose:
 *   onClose={async () => {
 *     if (await confirmClose(form)) { form.resetFields(); setDrawer(false); }
 *   }}
 *
 *   // With an explicit isDirty boolean (e.g. Roles page):
 *   if (await confirmClose(isDirty)) { setSelectedRoleId(nextId); }
 */

export interface ConfirmCloseOptions {
  title?: string;
  content?: string;
  okText?: string;
  cancelText?: string;
}

export function useUnsavedChanges() {
  /**
   * @param formOrDirty - Either an Ant Design FormInstance (dirty = form.isFieldsTouched())
   *                      or a plain boolean (dirty = the boolean itself).
   * @param opts        - Optional label overrides.
   * @returns Promise<boolean> — true means "proceed / discard", false means "stay / keep editing".
   */
  const confirmClose = (
    formOrDirty: FormInstance | boolean,
    opts?: ConfirmCloseOptions,
  ): Promise<boolean> => {
    const isDirty =
      typeof formOrDirty === 'boolean'
        ? formOrDirty
        : formOrDirty.isFieldsTouched();

    // No changes — close immediately, no popup needed.
    if (!isDirty) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: opts?.title ?? 'Unsaved Changes',
        content:
          opts?.content ??
          'You have unsaved changes. Are you sure you want to close? Your changes will be lost.',
        okText: opts?.okText ?? 'Discard Changes',
        cancelText: opts?.cancelText ?? 'Keep Editing',
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
        // Keep Modal above drawers (z-index 1100 > Drawer default 1000)
        zIndex: 1100,
      });
    });
  };

  return { confirmClose };
}
