export const DISPLAY_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type DisplayRatio = (typeof DISPLAY_RATIOS)[number];

export const RATIO_LABEL: Record<DisplayRatio, string> = {
  '16:9': 'Ngang',
  '9:16': 'Dọc',
  '1:1': 'Vuông',
};

/*
  What shape the clip actually is, asked of the file before it is uploaded.

  The owner films on a phone, so most clips are vertical and a few are not,
  and nobody should have to tell the shop something the file already knows.
  They can still overrule it afterwards — a vertical clip is allowed to be
  shown in a square frame if that is the look they want — so this preselects
  rather than decides.

  `videoWidth`/`videoHeight` are the dimensions as the clip will be drawn,
  with any rotation a phone recorded already applied. Reading the raw header
  instead would call a portrait video landscape, which is this whole problem
  in reverse.
*/
export function detectRatio(file: File): Promise<DisplayRatio | null> {
  if (!file.type.startsWith('video/')) return Promise.resolve(null);

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    // Metadata is all this needs, and a clip can be gigabytes.
    probe.preload = 'metadata';
    probe.muted = true;

    const done = (value: DisplayRatio | null) => {
      URL.revokeObjectURL(url);
      probe.removeAttribute('src');
      resolve(value);
    };

    // A codec the browser cannot decode, or a file still being written by a
    // phone: upload it anyway and let the owner pick the frame by hand.
    probe.onerror = () => done(null);
    // Nothing here is worth delaying an upload over.
    const giveUp = setTimeout(() => done(null), 8000);

    probe.onloadedmetadata = () => {
      clearTimeout(giveUp);
      const { videoWidth: w, videoHeight: h } = probe;
      if (!w || !h) return done(null);
      done(nearestRatio(w / h));
    };

    probe.src = url;
  });
}

/*
  Nearest of the three rather than a threshold: phones do not film exactly
  9:16 once cropping and stabilisation have had their say, and a clip at 0.58
  is a vertical clip by any reading a person would give it.
*/
export function nearestRatio(value: number): DisplayRatio {
  const options: [DisplayRatio, number][] = [
    ['16:9', 16 / 9],
    ['1:1', 1],
    ['9:16', 9 / 16],
  ];
  return options.reduce((best, option) =>
    Math.abs(Math.log(value / option[1])) < Math.abs(Math.log(value / best[1])) ? option : best,
  )[0];
}
