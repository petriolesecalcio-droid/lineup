const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const DEFAULT_BACKGROUND = '#0b0c11';
const MOBILE_REGEX = /Android|iPhone|iPad|iPod/i;

function createMobileDetector(override){
  if(typeof override === 'function'){
    return () => {
      try{
        return Boolean(override());
      }catch{
        return false;
      }
    };
  }
  return () => {
    try{
      return MOBILE_REGEX.test(navigator.userAgent || '');
    }catch{
      return false;
    }
  };
}

function isElement(value){
  return value instanceof Element;
}

function asElementArray(value){
  if(!value) return [];
  if(Array.isArray(value)) return value.filter(isElement);
  return isElement(value) ? [value] : [];
}

function hideTemporarily(elements){
  const stored = [];
  elements.forEach(el => {
    stored.push([el, el.style.visibility]);
    el.style.visibility = 'hidden';
  });
  return () => {
    stored.forEach(([el, previous]) => {
      if(previous){
        el.style.visibility = previous;
      }else{
        el.style.removeProperty('visibility');
      }
    });
  };
}

function canvasToBlob(canvas, type, quality){
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if(blob){
        resolve(blob);
      }else{
        reject(new Error('Impossibile generare l\'immagine.'));
      }
    }, type, quality);
  });
}

function downloadBlob(blob, fileName){
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function defaultFileNameFormatter(prefix){
  const base = prefix || 'share';
  const today = new Date().toISOString().slice(0, 10);
  return `${base}_${today}.png`;
}

function resolveFileName(options){
  if(options.fileName) return options.fileName;
  const formatter = typeof options.fileNameFormatter === 'function' ? options.fileNameFormatter : defaultFileNameFormatter;
  return formatter(options.fileNamePrefix || 'share', options);
}

function ensureContext(canvas){
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if(!ctx){
    throw new Error('Impossibile ottenere il contesto 2D.');
  }
  return ctx;
}

export function createStageShareHandler(stage, baseOptions = {}){
  if(!isElement(stage)){
    throw new Error('createStageShareHandler richiede un elemento stage valido.');
  }

  const defaults = {
    targetWidth: TARGET_WIDTH,
    targetHeight: TARGET_HEIGHT,
    backgroundColor: DEFAULT_BACKGROUND,
    fileNamePrefix: 'share',
    hideDuringCapture: [],
    captureClass: null,
    blobType: 'image/png',
    blobQuality: 0.95,
    shareTitle: '',
    shareText: '',
    minScale: 1,
    useCORS: true,
    html2canvasOptions: null,
    fitMode: 'contain',
    fileNameFormatter: defaultFileNameFormatter,
    onAfterShare: null,
    onBeforeCapture: null
  };

  return async function share(customOptions = {}){
    const options = { ...defaults, ...baseOptions, ...customOptions };
    const hideList = asElementArray(options.hideDuringCapture);
    const restoreVisibility = hideTemporarily(hideList);

    if(typeof options.onBeforeCapture === 'function'){
      try{ options.onBeforeCapture(options); }catch{ /* ignore */ }
    }

    if(options.captureClass){
      stage.classList.add(options.captureClass);
    }

    try{
      const rect = stage.getBoundingClientRect();
      const targetWidth = options.targetWidth;
      const targetHeight = options.targetHeight;
      const width = rect.width || targetWidth;
      const height = rect.height || targetHeight;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const needScale = Math.max(targetWidth / width, targetHeight / height);
      const baseScale = Math.max(dpr, needScale);
      const minScale = options.minScale == null ? 1 : options.minScale;
      let scale = Math.max(minScale, baseScale);

      if(typeof options.maxScale === 'number' && Number.isFinite(options.maxScale)){
        scale = Math.min(scale, options.maxScale);
      }

      const extraOptions = options.html2canvasOptions && typeof options.html2canvasOptions === 'object'
        ? { ...options.html2canvasOptions }
        : {};

      if(extraOptions.scale == null){
        extraOptions.scale = scale;
      }
      if(extraOptions.backgroundColor == null){
        extraOptions.backgroundColor = options.backgroundColor;
      }
      if(extraOptions.useCORS == null){
        extraOptions.useCORS = options.useCORS !== false;
      }

      const canvas = await html2canvas(stage, extraOptions);

      const out = document.createElement('canvas');
      out.width = targetWidth;
      out.height = targetHeight;
      const ctx = ensureContext(out);
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const sourceWidth = canvas.width || 1;
      const sourceHeight = canvas.height || 1;
      const fitMode = options.fitMode === 'cover' ? 'cover' : 'contain';
      const ratioFn = fitMode === 'cover' ? Math.max : Math.min;
      let ratio = ratioFn(targetWidth / sourceWidth, targetHeight / sourceHeight);
      if(!Number.isFinite(ratio) || ratio <= 0){
        ratio = 1;
      }
      const w = Math.round(sourceWidth * ratio);
      const h = Math.round(sourceHeight * ratio);
      const x = Math.floor((targetWidth - w) / 2);
      const y = Math.floor((targetHeight - h) / 2);
      ctx.drawImage(canvas, x, y, w, h);

      const blob = await canvasToBlob(out, options.blobType, options.blobQuality);
      const fileName = resolveFileName(options);
      const file = typeof File === 'function' ? new File([blob], fileName, { type: options.blobType }) : null;
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const canShareFiles = !!(file && nav && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }));

      if(canShareFiles && nav && typeof nav.share === 'function'){
        await nav.share({
          title: options.shareTitle,
          text: options.shareText,
          files: [file]
        });
        if(typeof options.onAfterShare === 'function'){
          options.onAfterShare({ shared: true, blob, file, fileName, options });
        }
        return { shared: true, blob, file, fileName };
      }

      downloadBlob(blob, fileName);
      if(typeof options.onAfterShare === 'function'){
        options.onAfterShare({ shared: false, blob, file, fileName, options });
      }
      return { shared: false, blob, file, fileName };
    }finally{
      if(options.captureClass){
        stage.classList.remove(options.captureClass);
      }
      restoreVisibility();
    }
  };
}

export function createInstagramOpener(options = {}){
  const {
    username = '',
    webUrl,
    appUrl,
    mobileDetector,
    fallbackDelay = 700,
    fallbackWindow = 1600
  } = options;

  const finalWebUrl = webUrl || (username ? `https://www.instagram.com/${username}/` : 'https://www.instagram.com/');
  const finalAppUrl = appUrl || (username ? `instagram://user?username=${username}` : 'instagram://app');
  const isMobile = createMobileDetector(mobileDetector);

  return () => {
    if(isMobile()){
      const start = Date.now();
      window.location.href = finalAppUrl;
      window.setTimeout(() => {
        if(Date.now() - start < fallbackWindow){
          window.open(finalWebUrl, '_blank', 'noopener');
        }
      }, fallbackDelay);
    }else{
      window.open(finalWebUrl, '_blank', 'noopener');
    }
  };
}

export function createWhatsAppOpener(options = {}){
  const {
    url,
    desktopUrl,
    mobileDetector,
    mobileTarget = '_blank',
    desktopTarget = '_blank'
  } = options;

  const targetUrl = url || 'https://www.whatsapp.com/';
  const desktopFallback = desktopUrl || targetUrl;
  const isMobile = createMobileDetector(mobileDetector);

  return () => {
    const isOnMobile = isMobile();
    const finalTarget = isOnMobile ? mobileTarget : desktopTarget;
    const finalUrl = isOnMobile ? targetUrl : desktopFallback;

    if(finalTarget === '_self'){
      window.location.href = finalUrl;
    }else{
      window.open(finalUrl, finalTarget, 'noopener');
    }
  };
}

export { TARGET_WIDTH, TARGET_HEIGHT };
