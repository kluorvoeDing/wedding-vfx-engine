// audio.js - 處理麥克風串流與音頻頻譜分析
export const AudioState = {
    isEnabled: false,
    audioPulse: 0.0, // Normalized bass energy (0.0 ~ 1.0)
    sensitivity: 1.6 // Multiplier for bass energy
};

let audioContext;
let analyser;
let dataArray;
let source;
let currentStream;

export async function initAudio() {
    try {
        stopAudio();
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        currentStream = stream;
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        
        // Settings for bass detection
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        AudioState.isEnabled = true;
        console.log("Audio pipeline initialized successfully.");
        return stream;
    } catch (err) {
        console.error("Microphone access denied or error: ", err);
        AudioState.isEnabled = false;
        return null;
    }
}

export function stopAudio() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }

    if (source) {
        source.disconnect();
        source = undefined;
    }

    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }

    audioContext = undefined;
    analyser = undefined;
    dataArray = undefined;
    AudioState.isEnabled = false;
    AudioState.audioPulse = 0.0;
}

export function updateAudio() {
    if (!AudioState.isEnabled || !analyser) return;

    analyser.getByteFrequencyData(dataArray);

    // Extract Bass energy (lower frequencies, e.g., bins 0 to 10 out of 128)
    let bassSum = 0;
    const bassBins = 10;
    for (let i = 0; i < bassBins; i++) {
        bassSum += dataArray[i];
    }
    
    // Average and normalize (0 to 1)
    let avgBass = (bassSum / bassBins) / 255.0;
    
    // Apply a threshold to remove noise
    avgBass = Math.max(0, avgBass - 0.4); 
    // Apply sensitivity multiplier
    avgBass *= AudioState.sensitivity;
    
    AudioState.audioPulse = Math.min(1.0, avgBass);
}
