let video;
let canvas;
let displaySize;
let isVideoPlaying = false;
let faceDescriptors = [];

// Video o'lchamlarini o'zgartirish uchun
const VIDEO_SIZE = {
    width: 720,
    height: 560
};

// Yuz deteksiyasi parametrlari
const FACE_DETECTION_OPTIONS = {
    scoreThreshold: 0.5,
    inputSize: 416
};

// Yuz tanib olish parametrlari
const RECOGNITION_THRESHOLD = 0.6;

async function initializeFaceAPI() {
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        updateStatus('Tizim tayyor!');
    } catch (error) {
        updateStatus('Modellarni yuklashda xatolik: ' + error.message);
    }
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
    Toastify({
        text: message,
        duration: 3000,
        gravity: "top",
        position: "right",
    }).showToast();
}

async function startVideo() {
    video = document.getElementById('video');
    canvas = document.getElementById('overlay');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        isVideoPlaying = true;
        
        document.getElementById('startButton').disabled = true;
        document.getElementById('stopButton').disabled = false;
        
        video.addEventListener('play', () => {
            displaySize = { width: video.width, height: video.height };
            faceapi.matchDimensions(canvas, displaySize);
            detectFaces();
        });
    } catch (error) {
        updateStatus('Kamerani ishga tushirishda xatolik: ' + error.message);
    }
}

async function stopVideo() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        isVideoPlaying = false;
        
        document.getElementById('startButton').disabled = false;
        document.getElementById('stopButton').disabled = true;
        
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
    }
}

async function detectFaces() {
    if (!isVideoPlaying) return;
    
    try {
        const detections = await faceapi.detectAllFaces(video, 
            new faceapi.TinyFaceDetectorOptions(FACE_DETECTION_OPTIONS))
            .withFaceLandmarks()
            .withFaceDescriptors();
        
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Yuz chegaralarini chizish
        faceapi.draw.drawDetections(canvas, resizedDetections);
        // Yuz nuqtalarini chizish
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        
        // Agar yuz tanib olish rejimi yoqilgan bo'lsa
        if (isRecognitionEnabled && faceDescriptors.length > 0) {
            await recognizeFaces(resizedDetections);
        }
        
        if (isVideoPlaying) {
            requestAnimationFrame(detectFaces);
        }
    } catch (error) {
        console.error('Yuz aniqlashda xatolik:', error);
        updateStatus('Yuz aniqlashda xatolik yuz berdi');
    }
}

// Yuz tanib olish funksiyasini takomillashtirish
async function recognizeFaces(detections) {
    const faceMatcher = new faceapi.FaceMatcher(
        faceDescriptors.map(fd => new faceapi.LabeledFaceDescriptors(fd.name, [fd.descriptor])),
        RECOGNITION_THRESHOLD
    );
    
    const context = canvas.getContext('2d');
    
    for (const detection of detections) {
        const match = faceMatcher.findBestMatch(detection.descriptor);
        const box = detection.detection.box;
        const label = match.toString();
        const isKnownPerson = match.distance < RECOGNITION_THRESHOLD;
        
        // Yuz atrofida ramka chizish
        const drawBox = new faceapi.draw.DrawBox(box, {
            label,
            lineWidth: 2,
            boxColor: isKnownPerson ? '#00ff00' : '#ff0000',
            drawLabel: true,
            fontSize: 20,
            fontColor: isKnownPerson ? '#00ff00' : '#ff0000'
        });
        drawBox.draw(canvas);
    }
}

// Ma'lumotlarni saqlash
function saveToLocalStorage() {
    try {
        const data = faceDescriptors.map(fd => ({
            name: fd.name,
            descriptor: Array.from(fd.descriptor)
        }));
        localStorage.setItem('faceData', JSON.stringify(data));
        updateStatus('Ma\'lumotlar saqlandi');
    } catch (error) {
        console.error('Saqlashda xatolik:', error);
        updateStatus('Ma\'lumotlarni saqlashda xatolik yuz berdi');
    }
}

// Ma'lumotlarni yuklash
function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem('faceData');
        if (data) {
            const parsedData = JSON.parse(data);
            faceDescriptors = parsedData.map(fd => ({
                name: fd.name,
                descriptor: new Float32Array(fd.descriptor)
            }));
            updateFacesList();
            updateStatus('Ma\'lumotlar yuklandi');
        }
    } catch (error) {
        console.error('Yuklashda xatolik:', error);
        updateStatus('Ma\'lumotlarni yuklashda xatolik yuz berdi');
    }
}

// Dastur ishga tushganda ma'lumotlarni yuklash
document.addEventListener('DOMContentLoaded', async () => {
    await initializeFaceAPI();
    loadFromLocalStorage();
});

// Ma'lumotlar o'zgarganida saqlash
function updateFacesList() {
    const facesList = document.getElementById('facesList');
    facesList.innerHTML = '';
    
    faceDescriptors.forEach((face, index) => {
        const faceItem = document.createElement('div');
        faceItem.className = 'face-item';
        faceItem.innerHTML = `
            <p>${face.name}</p>
            <div class="face-buttons">
                <button onclick="deleteFace(${index})">O'chirish</button>
                <button onclick="renameFace(${index})">Nomini o'zgartirish</button>
            </div>
        `;
        facesList.appendChild(faceItem);
    });
    
    saveToLocalStorage();
}

// Yuz nomini o'zgartirish
async function renameFace(index) {
    const newName = prompt('Yangi ismni kiriting:', faceDescriptors[index].name);
    if (newName && newName.trim()) {
        faceDescriptors[index].name = newName.trim();
        updateFacesList();
        updateStatus(`Ism ${newName}ga o'zgartirildi`);
    }
}

async function saveFace() {
    const name = document.getElementById('nameInput').value.trim();
    if (!name) {
        updateStatus('Iltimos, ism kiriting!');
        return;
    }
    
    const detections = await faceapi.detectSingleFace(video, 
        new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
    
    if (detections) {
        faceDescriptors.push({
            name: name,
            descriptor: detections.descriptor
        });
        updateStatus(`${name}ning yuzi saqlandi!`);
        updateFacesList();
    } else {
        updateStatus('Yuz topilmadi. Iltimos, kameraga qarang.');
    }
}

async function recognizeFace() {
    if (faceDescriptors.length === 0) {
        updateStatus('Saqlangan yuzlar mavjud emas!');
        return;
    }
    
    const detection = await faceapi.detectSingleFace(video, 
        new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
    
    if (detection) {
        const faceMatcher = new faceapi.FaceMatcher(faceDescriptors.map(fd => 
            new faceapi.LabeledFaceDescriptors(fd.name, [fd.descriptor])));
        
        const result = faceMatcher.findBestMatch(detection.descriptor);
        updateStatus(`Tanib olindi: ${result.toString()}`);
    } else {
        updateStatus('Yuz topilmadi');
    }
}

function clearData() {
    faceDescriptors = [];
    updateStatus('Barcha ma\'lumotlar o\'chirildi');
    updateFacesList();
}

function deleteFace(index) {
    faceDescriptors.splice(index, 1);
    updateStatus('Yuz o\'chirildi');
    updateFacesList();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initializeFaceAPI);
document.getElementById('startButton').addEventListener('click', startVideo);
document.getElementById('stopButton').addEventListener('click', stopVideo);
document.getElementById('saveButton').addEventListener('click', saveFace);
document.getElementById('recognizeButton').addEventListener('click', recognizeFace);
document.getElementById('clearButton').addEventListener('click', clearData); 