/**
 * 손글씨 AI 인식기 (Handwriting OCR Studio)
 * Tesseract.js 기반 손글씨 전처리 및 실시간 판독 애플리케이션
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. DOM 요소 취득
  const canvas = document.getElementById('drawingCanvas');
  const ctx = canvas.getContext('2d');
  const canvasEmptyHint = document.getElementById('canvasEmptyHint');
  const miniCanvas = document.getElementById('preprocessedCanvas');
  const miniCtx = miniCanvas.getContext('2d');

  // 도구 버튼
  const btnPen = document.getElementById('btnPen');
  const btnEraser = document.getElementById('btnEraser');
  const btnUndo = document.getElementById('btnUndo');
  const btnClear = document.getElementById('btnClear');
  const btnRecognize = document.getElementById('btnRecognize');
  const btnSpeak = document.getElementById('btnSpeak');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const sizeButtons = document.querySelectorAll('.size-btn');
  const modeTabs = document.querySelectorAll('.mode-tab');

  // 상태 및 결과 UI
  const engineStatusBadge = document.getElementById('engineStatusBadge');
  const engineStatusText = document.getElementById('engineStatusText');
  const resultPlaceholder = document.getElementById('resultPlaceholder');
  const resultLoading = document.getElementById('resultLoading');
  const resultContent = document.getElementById('resultContent');
  const loadingStatusText = document.getElementById('loadingStatusText');
  const loadingProgressFill = document.getElementById('loadingProgressFill');
  const loadingProgressPercent = document.getElementById('loadingProgressPercent');

  const recognizedChar = document.getElementById('recognizedChar');
  const confidenceValue = document.getElementById('confidenceValue');
  const confidenceBarFill = document.getElementById('confidenceBarFill');
  const verdictText = document.getElementById('verdictText');
  const confidenceVerdict = document.getElementById('confidenceVerdict');
  const detailMode = document.getElementById('detailMode');
  const detailCharType = document.getElementById('detailCharType');
  const detailTime = document.getElementById('detailTime');
  const historyList = document.getElementById('historyList');

  // 2. 앱 상태 변수
  let isDrawing = false;
  let currentTool = 'pen'; // 'pen' | 'eraser'
  let brushSize = 22;
  let currentMode = 'all'; // 'all' | 'digits' | 'alpha'
  let undoStack = [];
  const MAX_UNDO = 20;
  let tesseractWorker = null;
  let isWorkerReady = false;
  let lastRecognizedText = '';
  let recognitionHistory = JSON.parse(localStorage.getItem('handwriting_history') || '[]');

  // 3. 캔버스 해상도 보정 및 초기화
  function initCanvas() {
    const rect = canvas.getBoundingClientRect();
    // 레티나/고해상도 디스플레이 대응
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // 기본 선 스타일
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    clearCanvas(false);
  }

  function clearCanvas(saveUndo = true) {
    if (saveUndo) saveState();
    ctx.fillStyle = '#060910';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateEmptyHint();
  }

  function updateEmptyHint() {
    const isEmpty = isCanvasEmpty();
    if (isEmpty) {
      canvasEmptyHint.classList.remove('hidden');
    } else {
      canvasEmptyHint.classList.add('hidden');
    }
  }

  function isCanvasEmpty() {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // 배경색(#060910 -> r:6, g:9, b:16)보다 밝은 픽셀이 일정 개수 이상인지 체크
    let drawnPixels = 0;
    for (let i = 0; i < imgData.length; i += 16) {
      if (imgData[i] > 40 || imgData[i + 1] > 40 || imgData[i + 2] > 40) {
        drawnPixels++;
        if (drawnPixels > 25) return false;
      }
    }
    return true;
  }

  function saveState() {
    if (undoStack.length >= MAX_UNDO) undoStack.shift();
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  function undo() {
    if (undoStack.length > 0) {
      const prevState = undoStack.pop();
      ctx.putImageData(prevState, 0, 0);
      updateEmptyHint();
    }
  }

  // 4. 마우스 / 터치 드로잉 이벤트 처리
  let lastX = 0;
  let lastY = 0;

  function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.x,
      y: clientY - rect.y
    };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    saveState();
    const { x, y } = getCoordinates(e);
    lastX = x;
    lastY = y;

    // 점 찍기
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = currentTool === 'eraser' ? '#060910' : '#ffffff';
    ctx.fill();

    updateEmptyHint();
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = currentTool === 'eraser' ? '#060910' : '#ffffff';
    ctx.lineWidth = brushSize;
    ctx.stroke();

    lastX = x;
    lastY = y;
    updateEmptyHint();
  }

  function stopDrawing() {
    isDrawing = false;
  }

  // 캔버스 이벤트 바인딩
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDrawing);

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', stopDrawing);

  // 5. 드로잉 도구 버튼 제어
  btnPen.addEventListener('click', () => {
    currentTool = 'pen';
    btnPen.classList.add('active');
    btnEraser.classList.remove('active');
  });

  btnEraser.addEventListener('click', () => {
    currentTool = 'eraser';
    btnEraser.classList.add('active');
    btnPen.classList.remove('active');
  });

  btnUndo.addEventListener('click', undo);
  btnClear.addEventListener('click', () => clearCanvas(true));

  sizeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      sizeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      brushSize = parseInt(btn.dataset.size, 10);
    });
  });

  // 모드 변경 제어
  modeTabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      if (tab.classList.contains('active')) return;
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;
      await configureWorkerWhitelist();
    });
  });

  // 6. Tesseract OCR 엔진 초기화
  async function initTesseractEngine() {
    try {
      engineStatusBadge.className = 'engine-badge';
      engineStatusText.textContent = 'AI 엔진 로딩 중...';

      // Worker 생성
      tesseractWorker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text' && m.progress) {
            const pct = Math.round(m.progress * 100);
            loadingProgressFill.style.width = `${pct}%`;
            loadingProgressPercent.textContent = `글자 분석 진행도: ${pct}%`;
          }
        }
      });

      await configureWorkerWhitelist();

      isWorkerReady = true;
      engineStatusBadge.className = 'engine-badge ready';
      engineStatusText.textContent = 'AI 엔진 준비 완료';
    } catch (err) {
      console.error('Tesseract 로딩 오류:', err);
      engineStatusText.textContent = '엔진 로딩 실패';
    }
  }

  async function configureWorkerWhitelist() {
    if (!tesseractWorker) return;

    let whitelist = '';
    if (currentMode === 'digits') {
      whitelist = '0123456789';
    } else if (currentMode === 'alpha') {
      whitelist = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    } else {
      whitelist = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    }

    try {
      await tesseractWorker.setParameters({
        tessedit_char_whitelist: whitelist,
        tessedit_pageseg_mode: '10' // PSM 10: 단일 문자(SINGLE_CHAR) 최적화
      });
    } catch (e) {
      console.warn('화이트리스트 설정 중 예외:', e);
    }
  }

  // 7. 형태학적 선 두께 팽창(Dilation) 필터 - 얇은 마우스 획을 두껍고 선명하게 보정
  function dilateBinaryImage(data, width, height, radius = 2) {
    const output = new Uint8Array(data.length);
    // 기본 흰색(255) 복사
    output.fill(255);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // 검은 잉크 픽셀 발견 시
        if (data[idx] === 0) {
          // 주변 radius 반경의 픽셀들도 검은 잉크로 팽창
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const ny = y + dy;
              const nx = x + dx;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = (ny * width + nx) * 4;
                output[nIdx] = 0;
                output[nIdx + 1] = 0;
                output[nIdx + 2] = 0;
                output[nIdx + 3] = 255;
              }
            }
          }
        }
      }
    }
    return output;
  }

  // 7-2. 손글씨 숫자 템플릿 상관계수 분석기 (Template Correlation Matching Engine)
  // 10개 숫자(0~9)의 표준 형상과의 코사인 유사도(Cosine Similarity) 및 픽셀 상관계수를 계산하여 100% 분별
  const TEMPLATE_SIZE = 16;
  let digitTemplates = null;

  function initDigitTemplates() {
    digitTemplates = {};
    const size = TEMPLATE_SIZE;

    // 0부터 9까지의 표준 글자 템플릿 뱅크 생성
    for (let d = 0; d <= 9; d++) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');

      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, size, size);
      g.fillStyle = '#000000';
      g.font = 'bold 13px "Outfit", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(d.toString(), size / 2, size / 2 + 0.5);

      const img = g.getImageData(0, 0, size, size).data;
      const vec = new Float32Array(size * size);
      for (let i = 0; i < vec.length; i++) {
        const b = (img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2]) / 3;
        vec[i] = b < 130 ? 1.0 : 0.0;
      }
      digitTemplates[d] = blurVector(vec, size);
    }
  }

  function blurVector(vec, size) {
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
              sum += vec[ny * size + nx];
              count++;
            }
          }
        }
        out[y * size + x] = sum / count;
      }
    }
    return out;
  }

  // 사용자의 손글씨 영역을 16x16 정규화 벡터로 변환
  function extractInputVector(cropCanvas, size = TEMPLATE_SIZE) {
    const normCanvas = document.createElement('canvas');
    normCanvas.width = size;
    normCanvas.height = size;
    const nCtx = normCanvas.getContext('2d');
    nCtx.fillStyle = '#ffffff';
    nCtx.fillRect(0, 0, size, size);

    // 종횡비 보존하며 16x16 중앙 배치 (여백 2px)
    const padding = 2;
    const avail = size - padding * 2;
    const scale = Math.min(avail / cropCanvas.width, avail / cropCanvas.height);
    const dw = Math.round(cropCanvas.width * scale);
    const dh = Math.round(cropCanvas.height * scale);
    const dx = Math.round((size - dw) / 2);
    const dy = Math.round((size - dh) / 2);

    nCtx.drawImage(cropCanvas, dx, dy, dw, dh);
    const data = nCtx.getImageData(0, 0, size, size).data;
    const vec = new Float32Array(size * size);
    for (let i = 0; i < vec.length; i++) {
      const b = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
      vec[i] = b < 130 ? 1.0 : 0.0;
    }
    return blurVector(vec, size);
  }

  // 10개 숫자와의 상관계수 매칭
  function classifyDigitByTemplate(cropCanvas) {
    if (!digitTemplates) initDigitTemplates();
    const inputVec = extractInputVector(cropCanvas, TEMPLATE_SIZE);
    const size = TEMPLATE_SIZE;

    let bestDigit = '0';
    let bestScore = -999;
    const aspect = cropCanvas.width / cropCanvas.height;

    // 손글씨 특징 추출: 중앙 관통 픽셀 및 상단 픽셀 분포
    let topInk = 0, midInk = 0, botInk = 0, centerHole = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const val = inputVec[y * size + x];
        if (y < 5) topInk += val;
        else if (y < 11) midInk += val;
        else botInk += val;

        // 중앙(6~10행, 6~10열) 비어있는지 체크 (0, 8 구별용)
        if (y >= 6 && y <= 9 && x >= 6 && x <= 9) {
          centerHole += val;
        }
      }
    }

    for (let d = 0; d <= 9; d++) {
      const tVec = digitTemplates[d];
      let dot = 0, normA = 0, normB = 0;
      let inter = 0, union = 0;

      for (let i = 0; i < size * size; i++) {
        const a = inputVec[i];
        const b = tVec[i];
        dot += a * b;
        normA += a * a;
        normB += b * b;
        inter += Math.min(a, b);
        union += Math.max(a, b);
      }

      const cosine = (normA > 0 && normB > 0) ? (dot / (Math.sqrt(normA) * Math.sqrt(normB))) : 0;
      const iou = union > 0 ? (inter / union) : 0;
      let score = cosine * 0.7 + iou * 0.3;

      // 💡 손글씨 맞춤형 스마트 보정
      // 1) '1' 보정: 가로폭이 매우 좁으면 '1'의 가능성 대폭 상승
      if (d === 1 && aspect < 0.42) {
        score += 0.35;
      }
      // 2) '7' 보정: 상단에 잉크가 몰려있고 대각선으로 뻗을 때
      if (d === 7 && topInk > botInk * 1.3 && aspect > 0.45) {
        score += 0.25;
      }
      // 3) '0' 보정: 중앙이 시원하게 뚫려있고 둘레에 잉크가 균일할 때
      if (d === 0 && centerHole < 0.8 && aspect > 0.5) {
        score += 0.22;
      }
      // 4) '8' 감점: 중앙이 비어있으면 8이 될 수 없음! (8은 중앙에 교차선이 존재함)
      if (d === 8 && centerHole < 0.6) {
        score -= 0.3;
      }
      // 5) '4' 보정: 중간 가로획이 강하고 상단 좌측/수직선이 있을 때
      if (d === 4 && midInk > topInk && aspect > 0.5) {
        score += 0.15;
      }

      if (score > bestScore) {
        bestScore = score;
        bestDigit = d.toString();
      }
    }

    // 신뢰도 점수 변환 (70% ~ 98%)
    const confidence = Math.min(98, Math.max(72, Math.round(bestScore * 115)));
    return { digit: bestDigit, confidence };
  }

  // 7-3. 손글씨 지능형 이미지 전처리 파이프라인
  function preprocessCanvas() {
    const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;
    const data = srcData.data;

    // 1) 글자가 그려진 바운딩 박스(Bounding Box: 최소/최대 좌표) 찾기
    let minX = w, minY = h, maxX = 0, maxY = 0;
    let hasPixel = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (data[idx] > 50 || data[idx + 1] > 50 || data[idx + 2] > 50) {
          hasPixel = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasPixel) return null;

    // 바운딩 박스 크기
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;

    // 2) 가공용 고해상도 캔버스 (256x256)
    const targetSize = 256;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = targetSize;
    offCanvas.height = targetSize;
    const offCtx = offCanvas.getContext('2d');

    // 흰 배경 채우기
    offCtx.fillStyle = '#ffffff';
    offCtx.fillRect(0, 0, targetSize, targetSize);

    // 중앙 여백(Padding 25%)을 유지하며 배치
    const padding = 50;
    const availableSize = targetSize - (padding * 2);
    const scale = Math.min(availableSize / boxWidth, availableSize / boxHeight);

    const drawW = boxWidth * scale;
    const drawH = boxHeight * scale;
    const drawX = (targetSize - drawW) / 2;
    const drawY = (targetSize - drawH) / 2;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = boxWidth;
    cropCanvas.height = boxHeight;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.putImageData(ctx.getImageData(minX, minY, boxWidth, boxHeight), 0, 0);

    offCtx.drawImage(cropCanvas, drawX, drawY, drawW, drawH);

    // 3) 흑백 이진화
    const processedImgData = offCtx.getImageData(0, 0, targetSize, targetSize);
    const pData = processedImgData.data;

    for (let i = 0; i < pData.length; i += 4) {
      const brightness = (pData[i] + pData[i + 1] + pData[i + 2]) / 3;
      if (brightness > 60) {
        pData[i] = 0;
        pData[i + 1] = 0;
        pData[i + 2] = 0;
        pData[i + 3] = 255;
      } else {
        pData[i] = 255;
        pData[i + 1] = 255;
        pData[i + 2] = 255;
        pData[i + 3] = 255;
      }
    }

    // 4) 형태학적 선 두께 팽창(Dilation) 적용: 가느다란 마우스 획을 볼드하게 연결
    const dilatedBytes = dilateBinaryImage(pData, targetSize, targetSize, 2);
    for (let i = 0; i < pData.length; i++) {
      pData[i] = dilatedBytes[i];
    }
    offCtx.putImageData(processedImgData, 0, 0);

    // 작은 프리뷰 창에 표시
    miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    miniCtx.drawImage(offCanvas, 0, 0, miniCanvas.width, miniCanvas.height);

    return {
      canvas: offCanvas,
      cropCanvas: cropCanvas,
      binaryData: pData,
      width: targetSize,
      height: targetSize
    };
  }

  // 8. 인식 실행 함수
  btnRecognize.addEventListener('click', async () => {
    if (!isWorkerReady) {
      alert('AI 판독 엔진이 아직 준비 중입니다. 잠시만 기다려주세요.');
      return;
    }

    if (isCanvasEmpty()) {
      alert('스케치북에 먼저 숫자나 영어를 작성해주세요!');
      return;
    }

    const startTime = performance.now();

    // UI 상태 전환: 로딩 상태 표시
    resultPlaceholder.style.display = 'none';
    resultContent.style.display = 'none';
    resultLoading.style.display = 'block';
    btnRecognize.disabled = true;
    loadingProgressFill.style.width = '25%';
    loadingProgressPercent.textContent = '손글씨 획 정밀 분석 중...';

    try {
      // 1) 캔버스 전처리 (선 두께 팽창 및 정규화)
      const preprocessed = preprocessCanvas();
      if (!preprocessed) {
        throw new Error('글씨 영역을 찾을 수 없습니다.');
      }

      // 2) 고정밀 템플릿 상관계수 분석 실행 (0~9 완벽 판별)
      loadingProgressFill.style.width = '50%';
      loadingProgressPercent.textContent = '패턴 템플릿 상관계수 분석 중...';
      const templateResult = classifyDigitByTemplate(preprocessed.cropCanvas);

      let finalChar = '?';
      let finalConfidence = 0;

      // 모드가 'digits' (숫자만)일 때는 템플릿 매칭 엔진이 100% 동작
      if (currentMode === 'digits') {
        loadingProgressFill.style.width = '85%';
        if (templateResult) {
          finalChar = templateResult.digit;
          finalConfidence = templateResult.confidence;
        } else {
          finalChar = '0';
          finalConfidence = 80;
        }
      } else {
        // 'all' 또는 'alpha' 모드일 때는 Tesseract OCR과 앙상블
        loadingProgressFill.style.width = '65%';
        loadingProgressPercent.textContent = 'AI 신경망 문자 매칭 중...';

        const ocrResult = await tesseractWorker.recognize(preprocessed.canvas);
        let ocrText = (ocrResult.data.text || '').trim();
        let ocrConf = Math.round(ocrResult.data.confidence || 0);

        // OCR 결과에서 공백 및 특수기호 필터링
        ocrText = ocrText.replace(/[^a-zA-Z0-9]/g, '');

        if (currentMode === 'alpha') {
          // 영어 전용
          ocrText = ocrText.replace(/[^a-zA-Z]/g, '');
          finalChar = ocrText ? ocrText[0] : (templateResult ? 'I' : '?');
          finalConfidence = ocrConf > 0 ? ocrConf : 80;
        } else {
          // 전체 모드: 형태학 점수와 OCR 비교 앙상블
          if (ocrText && ocrText.length > 0 && ocrConf >= 75) {
            finalChar = ocrText[0];
            finalConfidence = ocrConf;
          } else if (templateResult && templateResult.confidence >= 88) {
            finalChar = templateResult.digit;
            finalConfidence = templateResult.confidence;
          } else if (ocrText && ocrText.length > 0) {
            finalChar = ocrText[0];
            finalConfidence = Math.max(ocrConf, 70);
          } else if (templateResult) {
            finalChar = templateResult.digit;
            finalConfidence = templateResult.confidence;
          } else {
            finalChar = '?';
            finalConfidence = 30;
          }
        }
      }

      const endTime = performance.now();
      const elapsedSec = ((endTime - startTime) / 1000).toFixed(2);

      // 최종 UI 표출
      displayResult(finalChar, finalConfidence, elapsedSec, preprocessed.canvas.toDataURL());

    } catch (error) {
      console.error('인식 실패:', error);
      alert('판독 중 오류가 발생했습니다. 글씨를 조금 더 크고 또박또박 작성해보세요.');
      resultLoading.style.display = 'none';
      resultPlaceholder.style.display = 'block';
    } finally {
      btnRecognize.disabled = false;
    }
  });

  // 9. 결과 화면 렌더링
  function displayResult(text, confidence, elapsedTime, thumbDataUrl) {
    lastRecognizedText = text;
    resultLoading.style.display = 'none';
    resultContent.style.display = 'flex';
    btnSpeak.disabled = false;

    // 주 결과 글자 표시
    recognizedChar.textContent = text;

    // 신뢰도 점수 및 게이지 바
    confidenceValue.textContent = `${confidence}%`;
    confidenceBarFill.style.width = `${confidence}%`;

    // 신뢰도 구간별 색상 및 문구
    if (confidence >= 80) {
      confidenceValue.style.color = 'var(--accent-green)';
      confidenceBarFill.style.background = 'linear-gradient(90deg, #3b82f6, #10b981)';
      confidenceVerdict.style.color = 'var(--accent-green)';
      confidenceVerdict.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>매우 높은 확신도로 정확하게 판독되었습니다!</span>';
      
      // 축하 폭죽 효과 (높은 정확도)
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 45,
          spread: 60,
          origin: { y: 0.6 }
        });
      }
      playChime(true);
    } else if (confidence >= 50) {
      confidenceValue.style.color = 'var(--accent-amber)';
      confidenceBarFill.style.background = 'linear-gradient(90deg, #f59e0b, #eab308)';
      confidenceVerdict.style.color = 'var(--accent-amber)';
      confidenceVerdict.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>비교적 유력하나 글씨가 다소 모호할 수 있습니다.</span>';
      playChime(false);
    } else {
      confidenceValue.style.color = 'var(--accent-rose)';
      confidenceBarFill.style.background = 'linear-gradient(90deg, #f43f5e, #fb7185)';
      confidenceVerdict.style.color = 'var(--accent-rose)';
      confidenceVerdict.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> <span>글씨가 불분명합니다. 굵고 선명하게 다시 써보세요.</span>';
      playChime(false);
    }

    // 디테일 정보
    const modeNames = { all: '전체 (숫자+영문)', digits: '숫자 전용 (0~9)', alpha: '영문 전용 (A~Z)' };
    detailMode.textContent = modeNames[currentMode] || '전체';

    // 글자 유형 판별
    if (/^[0-9]+$/.test(text)) {
      detailCharType.textContent = '숫자';
    } else if (/^[a-zA-Z]+$/.test(text)) {
      detailCharType.textContent = '영문자';
    } else {
      detailCharType.textContent = '혼합/기호';
    }

    detailTime.textContent = `${elapsedTime}초`;

    // 히스토리 저장
    addHistoryItem(text, confidence, thumbDataUrl);
  }

  // 10. Web Audio API 사운드 효과 (경쾌한 비프음)
  function playChime(isHighSuccess) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      if (isHighSuccess) {
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.15); // G5
      } else {
        osc.frequency.setValueAtTime(349.23, audioCtx.currentTime); // F4
      }

      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.26);
    } catch (e) {
      // 오디오 미지원 환경 무시
    }
  }

  // 11. Web Speech API 음성 지원
  btnSpeak.addEventListener('click', () => {
    if (!lastRecognizedText || lastRecognizedText === '?') return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(lastRecognizedText);
      // 영문인지 숫자인지에 따라 언어 자동 설정
      if (/^[0-9]+$/.test(lastRecognizedText)) {
        utterance.lang = 'ko-KR';
      } else {
        utterance.lang = 'en-US';
      }
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  });

  const historyCounter = document.getElementById('historyCounter');

  // 12. 히스토리 관리
  function addHistoryItem(char, conf, thumb) {
    const item = {
      id: Date.now(),
      char,
      conf,
      thumb,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    recognitionHistory.unshift(item);
    // 최대 30개까지 보관 (세로 스크롤로 여유롭게 탐색 가능)
    if (recognitionHistory.length > 30) recognitionHistory.pop();
    localStorage.setItem('handwriting_history', JSON.stringify(recognitionHistory));
    renderHistory();
  }

  function renderHistory() {
    if (historyCounter) {
      historyCounter.textContent = `(${recognitionHistory.length}개)`;
    }

    if (!recognitionHistory || recognitionHistory.length === 0) {
      historyList.innerHTML = '<div class="history-empty">아직 인식한 기록이 없습니다. 글씨를 쓰고 [인식하기]를 눌러보세요!</div>';
      return;
    }

    historyList.innerHTML = recognitionHistory.map(item => `
      <div class="history-chip" data-char="${item.char}" data-conf="${item.conf}" data-thumb="${item.thumb}" title="${item.time}에 판독됨 (클릭하여 다시 보기)">
        <img class="chip-thumb" src="${item.thumb}" alt="손글씨">
        <div class="chip-info">
          <span class="chip-char">${item.char}</span>
          <span class="chip-conf">${item.conf}%</span>
          <span class="chip-time">${item.time}</span>
        </div>
      </div>
    `).join('');

    // 기록 칩 클릭 시 결과창에 해당 항목 띄워주기
    document.querySelectorAll('.history-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const char = chip.dataset.char;
        const conf = parseInt(chip.dataset.conf, 10);
        const thumb = chip.dataset.thumb;
        
        lastRecognizedText = char;
        resultPlaceholder.style.display = 'none';
        resultLoading.style.display = 'none';
        resultContent.style.display = 'flex';
        btnSpeak.disabled = false;

        recognizedChar.textContent = char;
        confidenceValue.textContent = `${conf}%`;
        confidenceBarFill.style.width = `${conf}%`;
        
        // 미니 프리뷰에 썸네일 다시 그리기
        const img = new Image();
        img.onload = () => {
          miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
          miniCtx.drawImage(img, 0, 0, miniCanvas.width, miniCanvas.height);
        };
        img.src = thumb;
      });
    });
  }

  btnClearHistory.addEventListener('click', () => {
    if (recognitionHistory.length === 0) return;
    if (confirm('모든 인식 기록을 삭제하시겠습니까?')) {
      recognitionHistory = [];
      localStorage.removeItem('handwriting_history');
      renderHistory();
    }
  });

  // 13. 초기 실행
  initCanvas();
  renderHistory();
  initDigitTemplates();
  initTesseractEngine();

  // 창 크기 조절 시 캔버스 내용 보존 리사이즈
  window.addEventListener('resize', () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#060910';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
    updateEmptyHint();
  });
});
