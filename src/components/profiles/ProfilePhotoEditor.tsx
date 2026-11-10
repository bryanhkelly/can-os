import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ProfilePhoto, type ProfilePhotoReader } from "./ProfilePhoto";
import { photoUploadPolicy, validateUploadFile } from "@/platform/storage/private-upload";
import { mutationErrorMessage } from "@/lib/mutation-feedback";

export async function cropProfilePhoto(source: string, area: Area): Promise<File> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo editing is unavailable in this browser.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 512, 512);
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 512, 512);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    value => value ? resolve(value) : reject(new Error("Unable to prepare profile photo.")), "image/jpeg", 0.9,
  ));
  return new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
}

export function ProfilePhotoEditor({ personId, name, revision = 0, changed, createUploadTask, deletePhoto, readPhoto }: {
  personId?: string; name: string; revision?: number; changed: () => void;
  createUploadTask: (file: File) => { run: () => Promise<unknown> }; deletePhoto: () => Promise<unknown>;
  readPhoto?: ProfilePhotoReader;
}) {
  const [source, setSource] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const pending = useRef<{ key: string; task: { run: () => Promise<unknown> } } | null>(null);
  const objectUrl = useRef("");

  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  function clearSelection() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = ""; setSource(""); setArea(null); pending.current = null;
    if (input.current) input.current.value = "";
  }

  async function save() {
    if (!source || !area || saving.current) return;
    saving.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const key = source + JSON.stringify(area);
      if (pending.current?.key !== key) {
        const cropped = await cropProfilePhoto(source, area);
        pending.current = { key, task: createUploadTask(cropped) };
      }
      await pending.current.task.run();
      clearSelection(); changed(); setNotice("Profile picture saved.");
    } catch (cause) {
      setError(mutationErrorMessage(cause, "Unable to save profile picture. Your selection is retained for retry."));
    } finally { saving.current = false; setBusy(false); }
  }

  async function remove() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      await deletePhoto();
      clearSelection(); changed(); setConfirmRemoval(false); setNotice("Profile picture removed.");
    } catch (cause) {
      setError(mutationErrorMessage(cause, "Unable to remove profile picture. Please retry."));
    } finally { saving.current = false; setBusy(false); }
  }

  return <div className="space-y-5" aria-busy={busy}>
    <ProfilePhoto personId={personId} name={name} revision={revision} readPhoto={readPhoto}/>
    <Field label="Profile picture" description="JPEG or PNG, up to 2 MB" error={error || undefined}>
      <Input ref={input} type="file" accept="image/jpeg,image/png" disabled={busy}
        onChange={event => {
          const selected = event.target.files?.[0];
          if (!selected) return;
          setError(""); setNotice("");
          try {
            validateUploadFile(selected, photoUploadPolicy);
            clearSelection(); objectUrl.current = URL.createObjectURL(selected);
            setSource(objectUrl.current); setCrop({ x: 0, y: 0 }); setZoom(1);
          } catch { clearSelection(); setError("Choose a JPEG or PNG picture up to 2 MB."); }
        }}/>
    </Field>
    {source && <fieldset disabled={busy} className="space-y-4">
      <legend className="sr-only">Crop profile picture</legend>
      <div className="relative aspect-square w-full max-w-sm overflow-hidden border bg-muted">
        <Cropper image={source} crop={crop} zoom={zoom} aspect={1} cropShape="rect" showGrid={false}
          onCropChange={value => { if (!saving.current) setCrop(value); }}
          onZoomChange={value => { if (!saving.current) setZoom(value); }}
          onCropComplete={(_percentage, pixels) => { if (!saving.current) setArea(pixels); }}
          mediaProps={{ alt: "Profile picture crop preview", onError: () => { setArea(null); setError("This picture could not be opened. Choose another JPEG or PNG."); } }}
          cropperProps={{ "aria-label": "Crop profile picture", tabIndex: busy ? -1 : 0, "aria-disabled": busy }}
          onTouchRequest={() => !saving.current} onWheelRequest={() => !saving.current}
          keyboardStep={10} style={{ cropAreaStyle: { borderRadius: 0 } }}/>
      </div>
      <Field label="Zoom"><Input type="range" min="1" max="3" step="0.05" value={zoom}
        onChange={event => setZoom(Number(event.target.value))}/></Field>
    </fieldset>}
    <div className="flex flex-wrap gap-3">
      <Button disabled={busy || !area || !source} onClick={() => void save()}><Save aria-hidden="true"/>{busy ? "Saving..." : "Save picture"}</Button>
      <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><ImagePlus aria-hidden="true"/>Choose picture</Button>
      <Button variant="ghost" disabled={busy} onClick={() => { setError(""); setConfirmRemoval(true); }}><Trash2 aria-hidden="true"/>Remove picture</Button>
    </div>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <Modal open={confirmRemoval} onClose={() => setConfirmRemoval(false)} label="Remove profile picture" dismissible={!busy} busy={busy}>
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Remove profile picture?</h2>
        <p className="text-sm text-muted-foreground">Your profile will show the default person image instead.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <Button variant="destructive" disabled={busy} onClick={() => void remove()}><Trash2 aria-hidden="true"/>{busy ? "Removing..." : "Remove picture"}</Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirmRemoval(false)}>Cancel</Button>
        </div>
      </div>
    </Modal>
  </div>;
}