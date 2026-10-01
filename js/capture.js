/* Captura de dados: voz (Web Speech API), OCR de imagens/PDF digitalizados,
   texto de PDF e planilhas Excel/CSV. Bibliotecas externas são carregadas sob demanda. */
(function (root) {
  'use strict';
  const C = {};

  const LIBS = {
    tesseract: { url: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', global: 'Tesseract' },
    pdf: { url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', global: 'pdfjsLib' },
    xlsx: { url: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', global: 'XLSX' }
  };
  const loading = {};

  C.load = function (name) {
    const lib = LIBS[name];
    if (root[lib.global]) return Promise.resolve(root[lib.global]);
    if (loading[name]) return loading[name];
    loading[name] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = lib.url;
      s.async = true;
      s.onload = () => {
        if (name === 'pdf') root.pdfjsLib.GlobalWorkerOptions.workerSrc = lib.url.replace('pdf.min.js', 'pdf.worker.min.js');
        resolve(root[lib.global]);
      };
      s.onerror = () => { delete loading[name]; reject(new Error('Não foi possível carregar o componente "' + name + '". Verifique a conexão com a internet.')); };
      document.head.appendChild(s);
    });
    return loading[name];
  };

  /* ---------- Voz ---------- */

  C.voiceSupported = function () {
    return !!(root.SpeechRecognition || root.webkitSpeechRecognition);
  };

  /* Inicia o reconhecimento; retorna objeto com stop().
     onText(textoFinalAcumulado, parcial) é chamado a cada trecho reconhecido. */
  C.listen = function (opts) {
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (!SR) throw new Error('Este navegador não oferece reconhecimento de voz. Use Google Chrome ou Microsoft Edge.');
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = opts.initial || '';
    let stopped = false;
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += (finalText && !/\n$/.test(finalText) ? ', ' : '') + r[0].transcript.trim();
        else interim += r[0].transcript;
      }
      opts.onText(finalText, interim);
    };
    rec.onerror = (ev) => {
      const msg = {
        'not-allowed': 'O acesso ao microfone foi negado. Libere o microfone nas permissões do navegador.',
        'no-speech': 'Nenhuma fala detectada. Tente falar mais perto do microfone.',
        'audio-capture': 'Nenhum microfone encontrado.',
        'network': 'O reconhecimento de voz precisa de internet.'
      }[ev.error];
      if (opts.onError && ev.error !== 'aborted') opts.onError(msg || ('Erro no reconhecimento de voz: ' + ev.error));
    };
    rec.onend = () => {
      // o Chrome encerra após silêncio; reinicia até o usuário parar
      if (!stopped) { try { rec.start(); } catch (e) { if (opts.onEnd) opts.onEnd(); } }
      else if (opts.onEnd) opts.onEnd();
    };
    rec.start();
    return {
      stop: () => { stopped = true; try { rec.stop(); } catch (e) { /* já parado */ } },
      get text() { return finalText; }
    };
  };

  /* ---------- Arquivos ---------- */

  C.readAsDataUrl = function (file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    });
  };

  C.readAsText = function (file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsText(file, 'utf-8');
    });
  };

  C.readAsArrayBuffer = function (file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(file);
    });
  };

  /* Reduz imagens grandes antes de anexar (economiza espaço no navegador) */
  C.compressImage = function (dataUrl, maxSide, quality) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, (maxSide || 1600) / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality || 0.82));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  /* Converte arquivo em anexo armazenável */
  C.toAttachment = async function (file) {
    let dataUrl = await C.readAsDataUrl(file);
    if (/^image\//.test(file.type)) dataUrl = await C.compressImage(dataUrl);
    if (dataUrl.length > 6 * 1024 * 1024) throw new Error('Arquivo "' + file.name + '" muito grande (máx. ~4 MB).');
    return { id: Math.random().toString(36).slice(2), nome: file.name, tipo: file.type || '', dataUrl: dataUrl, data: new Date().toISOString() };
  };

  C.ocrImage = async function (source, onProgress) {
    const T = await C.load('tesseract');
    const res = await T.recognize(source, 'por', {
      logger: m => { if (onProgress && m.status === 'recognizing text') onProgress(Math.round(m.progress * 100), 'Lendo texto'); else if (onProgress && m.status) onProgress(null, traduzStatus(m.status)); }
    });
    return res.data.text || '';
  };

  function traduzStatus(s) {
    if (/load/.test(s)) return 'Carregando leitor de texto';
    if (/initializ/.test(s)) return 'Preparando leitor';
    return 'Processando';
  }

  /* Texto de PDF: usa a camada de texto; se for digitalização (sem texto), faz OCR página a página */
  C.pdfText = async function (arrayBuffer, onProgress) {
    const pdfjs = await C.load('pdf');
    const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      // reconstrói linhas pela coordenada Y
      const rows = {};
      tc.items.forEach(it => {
        const y = Math.round(it.transform[5]);
        const key = Object.keys(rows).find(k => Math.abs(k - y) <= 3) || y;
        (rows[key] = rows[key] || []).push({ x: it.transform[4], s: it.str });
      });
      Object.keys(rows).map(Number).sort((a, b) => b - a).forEach(y => {
        text += rows[y].sort((a, b) => a.x - b.x).map(r => r.s).join(' ').replace(/\s+/g, ' ').trim() + '\n';
      });
    }
    if (text.replace(/\s/g, '').length > 20) return text;
    // PDF digitalizado → OCR
    let ocr = '';
    for (let p = 1; p <= Math.min(doc.numPages, 5); p++) {
      if (onProgress) onProgress(null, 'Digitalização detectada — OCR da página ' + p + ' de ' + doc.numPages);
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      ocr += await C.ocrImage(canvas, onProgress) + '\n';
    }
    return ocr;
  };

  /* Lê planilha: retorna array de linhas (array de células) da primeira aba, e todas as abas */
  C.readSheet = async function (file) {
    if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
      const t = await C.readAsText(file);
      return { rows: root.U.parseCsv(t), sheets: null };
    }
    const X = await C.load('xlsx');
    const wb = X.read(await C.readAsArrayBuffer(file), { type: 'array' });
    const sheets = {};
    wb.SheetNames.forEach(n => { sheets[n] = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); });
    return { rows: sheets[wb.SheetNames[0]], sheets: sheets };
  };

  /* Extrai texto de qualquer arquivo suportado */
  C.extractText = async function (file, onProgress) {
    const name = file.name.toLowerCase();
    if (/^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif|tiff?)$/.test(name)) {
      const url = await C.readAsDataUrl(file);
      return C.ocrImage(url, onProgress);
    }
    if (file.type === 'application/pdf' || /\.pdf$/.test(name)) {
      if (onProgress) onProgress(null, 'Lendo PDF');
      return C.pdfText(await C.readAsArrayBuffer(file), onProgress);
    }
    if (/\.(xlsx|xls|ods|csv)$/.test(name)) {
      const sh = await C.readSheet(file);
      return sh.rows.map(r => r.join(' | ')).join('\n');
    }
    return C.readAsText(file);
  };

  /* Download de arquivo gerado */
  C.download = function (filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /* Gera .xlsx a partir de abas { nome: [[...linhas]] } */
  C.writeXlsx = async function (filename, sheets, colWidths) {
    const X = await C.load('xlsx');
    const wb = X.utils.book_new();
    Object.keys(sheets).forEach(n => {
      const ws = X.utils.aoa_to_sheet(sheets[n]);
      if (colWidths && colWidths[n]) ws['!cols'] = colWidths[n].map(w => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws, n.slice(0, 31));
    });
    X.writeFile(wb, filename);
  };

  root.C = C;
})(window);
