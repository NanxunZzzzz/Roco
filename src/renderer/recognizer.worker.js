let templates = [];

self.onmessage = function(e) {
    const { type, data } = e.data;
    
    if (type === 'setTemplates') {
        templates = data;
        self.postMessage({ type: 'ready', templates: templates.length });
        return;
    }
    
    if (type === 'recognize') {
        recognize(data).then(result => {
            self.postMessage({ type: 'result', result });
        }).catch(err => {
            self.postMessage({ type: 'error', error: err.message });
        });
    }
    
    if (type === 'matchRegion') {
        matchSingleRegion(data).then(result => {
            self.postMessage({ type: 'matchResult', regionKey: data.regionKey, result: result });
        }).catch(err => {
            self.postMessage({ type: 'matchResult', regionKey: data.regionKey, result: { matched: false, similarity: 0, error: err.message } });
        });
    }
};

async function recognize(screenshotBase64) {
    try {
        const imgData = await loadImage(screenshotBase64);
        
        const bgInfo = detectBackground(imgData.rgb, imgData.width, imgData.height);
        const subjectInfo = findAvatarRegion(imgData.gray, imgData.rgb, imgData.saturation, imgData.edges,
                                                imgData.width, imgData.height, bgInfo);
        const battleState = analyzeRegionColor(imgData.rgb, imgData.width, imgData.height, bgInfo, subjectInfo);
        
        let bestMatch = null;
        let bestSimilarity = 0;
        
        for (const template of templates) {
            try {
                const templateData = await loadImage(template.data);
                
                const templateMask = createTemplateMask(templateData.gray, templateData.width, templateData.height);
                
                const grayResult = templateMatch(imgData.gray, imgData.width, imgData.height,
                                                   templateData.gray, templateData.width, templateData.height,
                                                   subjectInfo, templateMask);
                
                const colorResult = analyzeColorFeatures(imgData.rgb, imgData.width, imgData.height,
                                                          templateData.rgb, templateData.width, templateData.height,
                                                          bgInfo, subjectInfo, templateMask);
                
                const combinedScore = grayResult.similarity * 0.25 + colorResult.similarity * 0.75;
                
                if (combinedScore > bestSimilarity) {
                    bestSimilarity = combinedScore;
                    bestMatch = {
                        name: template.name,
                        similarity: combinedScore,
                        grayScore: grayResult.similarity,
                        colorScore: colorResult.similarity,
                        pinkRatio: colorResult.pinkRatio,
                        matched: combinedScore >= 0.45,
                        bgInfo: bgInfo,
                        subjectInfo: subjectInfo
                    };
                }
            } catch (e) {
                console.error(`处理模板失败: ${template.name}`, e);
            }
        }
        
        return {
            success: true,
            matchedTemplate: bestMatch,
            battleState: battleState
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function matchSingleRegion(data) {
    try {
        const screenshot = await loadImage(data.screenshot);
        const template = await loadImage(data.template);
        
        if (screenshot.width !== template.width || screenshot.height !== template.height) {
            return { matched: false, similarity: 0, error: '尺寸不匹配' };
        }
        
        const pixelScore = comparePixelsWithTolerance(screenshot.rgb, template.rgb, screenshot.width, screenshot.height);
        const edgeScore = compareEdges(screenshot.gray, template.gray, screenshot.width, screenshot.height);
        
        const combinedScore = pixelScore * 0.7 + edgeScore * 0.3;
        
        return {
            matched: combinedScore >= 0.50,
            similarity: combinedScore,
            grayScore: edgeScore,
            colorScore: pixelScore
        };
    } catch (e) {
        console.error('匹配失败:', e.message);
        return { matched: false, similarity: 0, error: e.message };
    }
}

function comparePixelsWithTolerance(rgb1, rgb2, width, height) {
    const totalPixels = width * height;
    const colorTolerance = 50;
    let matchCount = 0;
    
    for (let i = 0; i < totalPixels; i++) {
        const idx = i * 3;
        const rDiff = Math.abs(rgb1[idx] - rgb2[idx]);
        const gDiff = Math.abs(rgb1[idx + 1] - rgb2[idx + 1]);
        const bDiff = Math.abs(rgb1[idx + 2] - rgb2[idx + 2]);
        
        if (rDiff < colorTolerance && gDiff < colorTolerance && bDiff < colorTolerance) {
            matchCount++;
        }
    }
    
    return matchCount / totalPixels;
}

function compareEdges(gray1, gray2, width, height) {
    const edges1 = computeEdges(gray1, width, height);
    const edges2 = computeEdges(gray2, width, height);
    
    const totalPixels = width * height;
    let matchCount = 0;
    
    for (let i = 0; i < totalPixels; i++) {
        const e1 = edges1[i];
        const e2 = edges2[i];
        
        const diff = Math.abs(e1 - e2);
        if (diff < 50 || (e1 < 30 && e2 < 30) || (e1 > 200 && e2 > 200)) {
            matchCount++;
        }
    }
    
    return matchCount / totalPixels;
}

function computeEdges(gray, width, height) {
    const edges = new Uint8Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            
            const gx = Math.abs(gray[idx + 1] - gray[idx - 1]) +
                       Math.abs(gray[idx + width + 1] - gray[idx - width - 1]) +
                       Math.abs(gray[idx + width + 1] - gray[idx - width + 1]);
            
            const gy = Math.abs(gray[idx + width] - gray[idx - width]) +
                       Math.abs(gray[idx + width + 1] - gray[idx - width - 1]) +
                       Math.abs(gray[idx + width - 1] - gray[idx - width + 1]);
            
            edges[idx] = Math.min(255, Math.floor(Math.sqrt(gx * gx + gy * gy)));
        }
    }
    
    return edges;
}

function calculateSSIM(img1, img2, width, height) {
    const totalPixels = width * height;
    
    let mean1 = 0, mean2 = 0;
    for (let i = 0; i < totalPixels; i++) {
        mean1 += img1[i];
        mean2 += img2[i];
    }
    mean1 /= totalPixels;
    mean2 /= totalPixels;
    
    let var1 = 0, var2 = 0, cov = 0;
    for (let i = 0; i < totalPixels; i++) {
        const diff1 = img1[i] - mean1;
        const diff2 = img2[i] - mean2;
        var1 += diff1 * diff1;
        var2 += diff2 * diff2;
        cov += diff1 * diff2;
    }
    var1 /= totalPixels;
    var2 /= totalPixels;
    cov /= totalPixels;
    
    const k1 = 0.01, k2 = 0.03;
    const L = 255;
    const c1 = (k1 * L) * (k1 * L);
    const c2 = (k2 * L) * (k2 * L);
    const c3 = c2 / 2;
    
    const numerator = (2 * mean1 * mean2 + c1) * (2 * cov + c2);
    const denominator = (mean1 * mean1 + mean2 * mean2 + c1) * (var1 + var2 + c2);
    
    return denominator === 0 ? 0 : numerator / denominator;
}

async function loadImage(base64) {
    const response = await fetch(base64);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);
    
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);
    
    const len = imgData.width * imgData.height;
    const gray = new Uint8Array(len);
    const rgb = new Uint8ClampedArray(len * 3);
    const saturation = new Uint8Array(len);
    const edges = new Uint8Array(len);
    
    for (let i = 0; i < len; i++) {
        const idx = i * 4;
        const r = imgData.data[idx];
        const g = imgData.data[idx + 1];
        const b = imgData.data[idx + 2];
        
        gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        
        rgb[i * 3] = r;
        rgb[i * 3 + 1] = g;
        rgb[i * 3 + 2] = b;
        
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        saturation[i] = maxC === 0 ? 0 : Math.round((maxC - minC) / maxC * 255);
        
        if (i > 0 && i < len - 1 && (i % imgData.width > 0) && (i % imgData.width < imgData.width - 1)) {
            const gx = Math.abs(gray[i+1] - gray[i-1]);
            const gy = Math.abs(gray[i + imgData.width] - gray[i - imgData.width]);
            edges[i] = Math.min(255, Math.sqrt(gx*gx + gy*gy));
        }
    }
    
    return {
        width: imgData.width,
        height: imgData.height,
        gray: gray,
        rgb: rgb,
        saturation: saturation,
        edges: edges
    };
}

function createTemplateMask(templateGray, tw, th) {
    const mask = new Float32Array(tw * th);
    const cx = tw / 2;
    const cy = th / 2;
    const radius = Math.min(tw, th) / 2 * 0.85;
    
    for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < radius * 0.7) {
                mask[y * tw + x] = 1.0;
            } else if (dist < radius) {
                mask[y * tw + x] = 1.0 - (dist - radius * 0.7) / (radius * 0.3);
            } else if (dist < radius * 1.3) {
                mask[y * tw + x] = 0.15;
            } else {
                mask[y * tw + x] = 0.02;
            }
        }
    }
    
    return mask;
}

function findAvatarRegion(gray, rgb, saturation, edges, width, height, bgInfo) {
    const w = width, h = height;
    const weightMap = new Float32Array(w * h);
    
    const blockSize = Math.max(6, Math.min(12, Math.floor(Math.min(w, h) / 10)));
    const blocksX = Math.ceil(w / blockSize);
    const blocksY = Math.ceil(h / blockSize);
    
    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            let satSum = 0, edgeSum = 0, colorVarSum = 0;
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            
            const sx = bx * blockSize, ex = Math.min(sx + blockSize, w);
            const sy = by * blockSize, ey = Math.min(sy + blockSize, h);
            
            for (let y = sy; y < ey; y++) {
                for (let x = sx; x < ex; x++) {
                    const idx = y * w + x;
                    satSum += saturation[idx];
                    edgeSum += edges[idx];
                    rSum += rgb[idx*3]; gSum += rgb[idx*3+1]; bSum += rgb[idx*3+2];
                    count++;
                }
            }
            
            if (count < 4) continue;
            
            const avgSat = satSum / count;
            const avgEdge = edgeSum / count;
            const avgR = rSum/count, avgG = gSum/count, avgB = bSum/count;
            
            let varSum = 0;
            for (let y = sy; y < ey; y++) {
                for (let x = sx; x < ex; x++) {
                    const idx = y * w + x;
                    varSum += Math.pow(rgb[idx*3]-avgR, 2) + Math.pow(rgb[idx*3+1]-avgG, 2) + Math.pow(rgb[idx*3+2]-avgB, 2);
                }
            }
            const colorVar = Math.sqrt(varSum / (count * 3));
            
            let blockScore = avgSat * 0.35 + avgEdge * 0.35 + colorVar * 0.30;
            
            if (bgInfo && bgInfo.hasGreenBg) {
                const greenness = avgG > 70 ? Math.min(1, (avgG - avgR) / 50) : 0;
                blockScore *= Math.max(0.1, 1 - greenness * 1.0);
            }
            
            for (let y = sy; y < ey; y++) {
                for (let x = sx; x < ex; x++) {
                    weightMap[y * w + x] = blockScore;
                }
            }
        }
    }
    
    let totalW = 0, maxW = 0;
    for (let i = 0; i < weightMap.length; i++) { totalW += weightMap[i]; if (weightMap[i] > maxW) maxW = weightMap[i]; }
    const avgW = totalW / weightMap.length;
    
    const cx = w / 2, cy = h / 2;
    
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            const dx = (x - cx) / cx, dy = (y - cy) / cy;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const centerFalloff = Math.max(0.25, 1 - dist * 0.6);
            
            let relativeW = avgW > 0 ? weightMap[idx] / avgW : 1;
            relativeW = Math.max(0.15, Math.min(2.5, relativeW));
            
            weightMap[idx] *= centerFalloff * relativeW;
        }
    }
    
    maxW = 0;
    for (let i = 0; i < weightMap.length; i++) { if (weightMap[i] > maxW) maxW = weightMap[i]; }
    
    return {
        weightMap: weightMap,
        maxWeight: maxW,
        avgWeight: avgW
    };
}

function detectBackground(rgb, width, height) {
    let totalR = 0, totalG = 0, totalB = 0;
    let lowSatCount = 0, totalCount = 0;
    let greenPixelCount = 0, blueSkyCount = 0;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            const r = rgb[idx], g = rgb[idx+1], b = rgb[idx+2];
            totalR += r; totalG += g; totalB += b; totalCount++;
            
            const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
            const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
            if (sat < 0.2) lowSatCount++;
            if (g > 100 && g > r * 1.3 && g > b * 1.2 && g - r > 30) greenPixelCount++;
            if (b > 120 && b > r * 1.2 && b > g && b - g > 20) blueSkyCount++;
        }
    }
    
    const greenRatio = greenPixelCount / totalCount;
    const blueRatio = blueSkyCount / totalCount;
    const lowSatRatio = lowSatCount / totalCount;
    
    let bgType = 'unknown';
    if (greenRatio > 0.20) bgType = 'grass';
    else if (blueRatio > 0.15) bgType = 'sky';
    else if (lowSatRatio > 0.5) bgType = 'neutral';
    else bgType = 'complex';
    
    return {
        type: bgType,
        avgColor: { r: totalR/totalCount, g: totalG/totalCount, b: totalB/totalCount },
        lowSatRatio: lowSatRatio,
        greenRatio: greenRatio,
        blueRatio: blueRatio,
        hasGreenBg: greenRatio > 0.12,
        hasBlueBg: blueRatio > 0.10
    };
}

function analyzeRegionColor(rgb, width, height, bgInfo, subjectInfo) {
    let greenCount = 0, pinkCount = 0, validCount = 0;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            const r = rgb[idx], g = rgb[idx+1], b = rgb[idx+2];
            
            let w = subjectInfo ? subjectInfo.weightMap[y * width + x] : 1;
            if (w < 0.18) continue;
            
            const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
            const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
            
            if (bgInfo && bgInfo.hasGreenBg && sat < 0.16) continue;
            if (bgInfo && bgInfo.hasGreenBg && g > 72 && g > r * 1.18 && g - b > 18) continue;
            if (bgInfo && bgInfo.hasBlueBg && b > 82 && b > g * 1.10 && b - r > 18) continue;
            
            validCount += w;
            if (isGreenHP(r, g, b)) greenCount += w;
            else if (isPinkHP(r, g, b)) pinkCount += w;
        }
    }
    
    const gp = validCount > 0 ? greenCount / validCount * 100 : 0;
    const pp = validCount > 0 ? pinkCount / validCount * 100 : 0;
    
    if (gp > 8 || pp > 8) {
        const hpType = pp > gp ? 'pink' : 'green';
        return { inBattle: true, hpColor: { type: hpType, greenPercent: gp.toFixed(1), pinkPercent: pp.toFixed(1), fillRate: hpType === 'pink' ? pp.toFixed(1) : gp.toFixed(1) } };
    }
    return { inBattle: false, reason: 'no_hp_color' };
}

function isGreenHP(r, g, b) {
    if (g < 100 || r > 185) return false;
    if (g < r * 1.10) return false;
    if (b > g * 0.90) return false;
    return (g - r) > 20 && (g - b) > 14;
}

function isPinkHP(r, g, b) {
    if (r < 130) return false;
    if (r < g * 1.05) return false;
    if (Math.abs(r - b) < 40) return false;
    return r > g && r > b && (r - g) > 14;
}

function templateMatch(screenshotGray, sw, sh, templateGray, tw, th, subjectInfo, templateMask) {
    if (tw > sw || th > sh) return { similarity: 0 };
    
    let bestMatch = 0;
    const step = Math.max(3, Math.floor(sw / 25));
    const tolerance = 36;
    
    for (let y = 0; y <= sh - th; y += step) {
        for (let x = 0; x <= sw - tw; x += step) {
            const m = compareGrayRegion(screenshotGray, templateGray, sw, tw, th, x, y, tolerance, subjectInfo, templateMask);
            if (m > bestMatch) bestMatch = m;
        }
    }
    return { similarity: bestMatch };
}

function compareGrayRegion(screenshotGray, templateGray, sw, tw, th, startX, startY, tolerance, subjectInfo, templateMask) {
    let matchSum = 0, totalW = 0;
    
    for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
            const sIdx = (startY + y) * sw + (startX + x);
            const tIdx = y * tw + x;
            
            let pw = subjectInfo ? subjectInfo.weightMap[sIdx] : 1;
            let mw = templateMask ? templateMask[tIdx] : 1;
            let w = pw * mw;
            
            if (w < 0.08) { totalW += w * 0.5; continue; }
            
            totalW += w;
            if (Math.abs(screenshotGray[sIdx] - templateGray[tIdx]) < tolerance) matchSum += w;
        }
    }
    
    return totalW > 0 ? matchSum / totalW : 0;
}

function analyzeColorFeatures(screenshotRgb, sw, sh, templateRgb, tw, th, bgInfo, subjectInfo, templateMask) {
    if (tw > sw || th > sh) return { similarity: 0, pinkRatio: 0 };
    
    let bestCM = 0, bestPR = 0;
    const step = Math.max(3, Math.floor(sw / 25));
    
    for (let y = 0; y <= sh - th; y += step) {
        for (let x = 0; x <= sw - tw; x += step) {
            const r = compareColorRegion(screenshotRgb, sw, templateRgb, tw, th, x, y, bgInfo, subjectInfo, templateMask);
            if (r.colorMatch > bestCM) { bestCM = r.colorMatch; bestPR = r.pinkRatio; }
        }
    }
    
    return { similarity: bestCM, pinkRatio: bestPR };
}

function compareColorRegion(screenshot, sw, template, tw, th, startX, startY, bgInfo, subjectInfo, templateMask) {
    let cmSum = 0, ppSum = 0, totalW = 0;
    
    for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
            const sIdx = ((startY + y) * sw + (startX + x)) * 3;
            const tIdx = (y * tw + x) * 3;
            
            const sr = screenshot[sIdx], sg = screenshot[sIdx+1], sb = screenshot[sIdx+2];
            const tr = template[tIdx], tg = template[tIdx+1], tb = template[tIdx+2];
            
            let pw = subjectInfo ? subjectInfo.weightMap[(startY+y)*sw+(startX+x)] : 1;
            let mw = templateMask ? templateMask[tIdx] : 1;
            let w = pw * mw;
            
            if (w < 0.08) { totalW += w * 0.5; continue; }
            
            if (bgInfo && (bgInfo.hasGreenBg || bgInfo.hasBlueBg)) {
                const ms = Math.max(sr,sg,sb), mins = Math.min(sr,sg,sb), satS = ms===0?0:(ms-mins)/ms;
                const mt = Math.max(tr,tg,tb), mint = Math.min(tr,tg,tb), satT = mt===0?0:(mt-mint)/mt;
                if (satS < 0.10 && satT < 0.10) { totalW += w * 0.5; continue; }
                if (bgInfo.hasGreenBg && sg > 60 && sg > sr*1.16 && sg-sb>16) { totalW += w * 0.25; continue; }
            }
            
            totalW += w;
            
            const brS = (sr+sg+sb)/3, brT = (tr+tg+tb)/3;
            let rd, gd, bd;
            if (brS > 10 && brT > 10) {
                const rs = 255/brS, rt = 255/brT;
                rd = Math.abs(sr*rs - tr*rt); gd = Math.abs(sg*rs - tg*rt); bd = Math.abs(sb*rs - tb*rt);
            } else {
                rd = Math.abs(sr-tr); gd = Math.abs(sg-tg); bd = Math.abs(sb-tb);
            }
            
            if (rd < 58 && gd < 58 && bd < 58) cmSum += w;
            
            const hsv = rgbToHsv(sr, sg, sb);
            if (isPinkPurple(hsv.h, hsv.s, hsv.v)) ppSum += w;
        }
    }
    
    return { colorMatch: totalW > 0 ? cmSum/totalW : 0, pinkRatio: totalW > 0 ? ppSum/totalW : 0 };
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0, s = max === 0 ? 0 : d/max, v = max;
    if (d !== 0) switch (max) {
        case r: h = ((g-b)/d + (g<b?6:0))/6; break;
        case g: h = ((b-r)/d + 2)/6; break;
        case b: h = ((r-g)/d + 4)/6; break;
    }
    return { h: h*360, s, v };
}

function isPinkPurple(h, s, v) {
    if (v < 0.18 || s < 0.18) return false;
    return (h >= 300 && h <= 360) || (h >= 0 && h <= 38);
}