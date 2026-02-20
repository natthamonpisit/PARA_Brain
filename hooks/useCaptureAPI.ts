// ─── useCaptureAPI ────────────────────────────────────────────────────────────
// Thin wrappers around /api/capture-intake and /api/capture-image endpoints.

const getCaptureKey = () =>
  String((import.meta as any)?.env?.VITE_CAPTURE_API_SECRET || '').trim();

export const callCaptureIntake = async (text: string): Promise<any> => {
  const response = await fetch('/api/capture-intake', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-capture-key': getCaptureKey()
    },
    body: JSON.stringify({ source: 'WEB', message: text })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Capture API failed (${response.status})`);
  }
  return body;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const cleaned = raw.replace(/^data:[^;]+;base64,/i, '');
      if (!cleaned) {
        reject(new Error('Failed to encode image file'));
        return;
      }
      resolve(cleaned);
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

export const callCaptureImageIntake = async (file: File, caption: string): Promise<any> => {
  const imageBase64 = await fileToBase64(file);
  const response = await fetch('/api/capture-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-capture-key': getCaptureKey()
    },
    body: JSON.stringify({
      source: 'WEB',
      caption,
      mimeType: file.type || 'image/jpeg',
      imageBase64
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Capture image API failed (${response.status})`);
  }
  return body;
};
