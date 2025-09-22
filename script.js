// Parking system data
let parkingData = {
    slotsCar: {},
    slotsBike: {},
    slotsTruck: {},
    parkedVehicles: {},
    totalSlots: { car: 100, bike: 300, truck: 50 },
    history: [],
    rates: {
        car: 60,
        bike: 30,
        truck: 100
    },
    billingIncrement: 15  // Minutes for fractional billing (after first hour)
};

// Tesseract worker
let tesseractWorker;
async function initTesseract() {
    if (!tesseractWorker) {
        tesseractWorker = await Tesseract.createWorker('eng');
    }
}

// Load from localStorage on init
function loadParkingData() {
    const saved = localStorage.getItem('parkingData');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            parkingData.slotsCar = data.slotsCar || {};
            parkingData.slotsBike = data.slotsBike || {};
            parkingData.slotsTruck = data.slotsTruck || {};
            parkingData.parkedVehicles = data.parkedVehicles || {};
            parkingData.history = data.history || [];
            for (let i = 1; i <= parkingData.totalSlots.car; i++) {
                if (!parkingData.slotsCar[i]) parkingData.slotsCar[i] = { status: 'empty', vehicle: null };
            }
            for (let i = 1; i <= parkingData.totalSlots.bike; i++) {
                if (!parkingData.slotsBike[i]) parkingData.slotsBike[i] = { status: 'empty', vehicle: null };
            }
            for (let i = 1; i <= parkingData.totalSlots.truck; i++) {
                if (!parkingData.slotsTruck[i]) parkingData.slotsTruck[i] = { status: 'empty', vehicle: null };
            }
            Object.values(parkingData.parkedVehicles).forEach(vehicle => {
                if (typeof vehicle.checkInTime === 'string' && !vehicle.checkInTime.includes('T')) {
                    vehicle.checkInTime = new Date(vehicle.checkInTime).toISOString();
                }
            });
        } catch (e) {
            console.warn('Failed to load parking data:', e);
        }
    }
}

// Save to localStorage
function saveParkingData() {
    localStorage.setItem('parkingData', JSON.stringify(parkingData));
}

// Initialize parking slots for the current vehicle type
function initializeParkingSlots(vehicleType = 'car') {
    const slotsContainer = document.getElementById('slotsContainer');
    slotsContainer.innerHTML = '';
    const slots = getSlotsForType(vehicleType);

    for (let i = 1; i <= parkingData.totalSlots[vehicleType]; i++) {
        if (!slots[i]) {
            slots[i] = { status: 'empty', vehicle: null };
        }
        
        const slotElement = document.createElement('div');
        slotElement.className = `slot ${slots[i].status}`;
        if (slots[i].status === 'occupied' && slots[i].vehicle) {
            slotElement.innerHTML = `${i}<div class="car-info">${slots[i].vehicle}</div>`;
            slotElement.title = `Slot ${i} - Occupied by ${slots[i].vehicle}`;
        } else {
            slotElement.textContent = i;
            slotElement.title = `Slot ${i} - Available`;
        }
        slotElement.onclick = () => showSlotInfo(i, vehicleType);
        
        slotsContainer.appendChild(slotElement);
    }
    
    updateStats(vehicleType);
}

// Update statistics for the current vehicle type
function updateStats(vehicleType) {
    const slots = getSlotsForType(vehicleType);
    const occupied = Object.values(slots).filter(slot => slot.status === 'occupied').length;
    const available = parkingData.totalSlots[vehicleType] - occupied;
    
    document.getElementById('totalSlots').textContent = parkingData.totalSlots[vehicleType];
    document.getElementById('availableSlots').textContent = available;
    document.getElementById('occupiedSlots').textContent = occupied;
}

// Show slot information for the current vehicle type
function showSlotInfo(slotNumber, vehicleType) {
    const slots = getSlotsForType(vehicleType);
    const slot = slots[slotNumber];
    if (slot.status === 'occupied' && slot.vehicle) {
        const vehicle = parkingData.parkedVehicles[slot.vehicle];
        if (vehicle) {
            const realTimeDuration = calculateRealTimeDuration(vehicle.checkInTime);
            showAlert(`Slot ${slotNumber} - Occupied by ${slot.vehicle} (${vehicle.type}) for ${realTimeDuration}`, 'info');
        } else {
            showAlert(`Slot ${slotNumber} - Occupied (details unavailable)`, 'info');
        }
    } else {
        showAlert(`Slot ${slotNumber} is available for parking`, 'success');
    }
}

// Get slots object based on vehicle type
function getSlotsForType(vehicleType) {
    return {
        car: parkingData.slotsCar,
        bike: parkingData.slotsBike,
        truck: parkingData.slotsTruck
    }[vehicleType];
}

// Update parking grid based on selected vehicle type
function updateParkingGrid() {
    const vehicleType = document.getElementById('vehicleType').value;
    initializeParkingSlots(vehicleType);
}

// Calculate real-time duration (actual elapsed time)
function calculateRealTimeDuration(checkInTimeStr) {
    const checkInTime = new Date(checkInTimeStr);
    const now = new Date();
    if (isNaN(checkInTime.getTime())) return 'Unknown';
    const diffMs = now - checkInTime;
    const diffSeconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(diffSeconds / 60);
    const seconds = diffSeconds % 60;
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`;
}

// Calculate billing duration (for cost estimation)
function calculateCurrentDuration(checkInTimeStr) {
    const checkInTime = new Date(checkInTimeStr);
    const now = new Date();
    if (isNaN(checkInTime.getTime())) return 'Unknown';
    const diffMs = now - checkInTime;
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    const incrementMinutes = parkingData.billingIncrement;
    const billedMinutes = Math.max(incrementMinutes, Math.ceil(diffMinutes / incrementMinutes) * incrementMinutes);
    const billedHours = (billedMinutes / 60).toFixed(2);
    return `${billedMinutes} minute${billedMinutes !== 1 ? 's' : ''} (${billedHours} billed hours)`;
}

// Find next available slot for the given vehicle type
function findAvailableSlot(vehicleType) {
    const slots = getSlotsForType(vehicleType);
    for (let i = 1; i <= parkingData.totalSlots[vehicleType]; i++) {
        if (slots[i].status === 'empty') {
            return i;
        }
    }
    return null;
}

// Check-in vehicle
function checkInVehicle() {
    const carNumber = document.getElementById('carNumber').value.trim().toUpperCase();
    const vehicleType = document.getElementById('vehicleType').value;
    const duration = parseInt(document.getElementById('duration').value);

    if (!carNumber.match(/^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/)) {
        showAlert('Please enter a valid car number (e.g., MH02FM1234)!', 'danger');
        return;
    }

    if (parkingData.parkedVehicles[carNumber]) {
        showAlert('Vehicle is already parked!', 'danger');
        return;
    }

    const availableSlot = findAvailableSlot(vehicleType);
    if (!availableSlot) {
        showAlert(`Sorry! No ${vehicleType} parking slots available.`, 'danger');
        return;
    }

    const expectedCost = parkingData.rates[vehicleType] * duration;
    const checkInTime = new Date().toISOString();
    const slots = getSlotsForType(vehicleType);

    slots[availableSlot] = {
        status: 'occupied',
        vehicle: carNumber
    };

    parkingData.parkedVehicles[carNumber] = {
        slotNumber: availableSlot,
        type: vehicleType,
        checkInTime: checkInTime,
        expectedDuration: duration,
        expectedCost: expectedCost
    };

    saveParkingData();

    updateSlotDisplay(availableSlot, 'occupied', carNumber, vehicleType);
    updateStats(vehicleType);
    generateReceipt(carNumber, availableSlot, vehicleType, checkInTime, expectedCost);
    
    showAlert(`Vehicle ${carNumber} successfully parked in slot ${availableSlot} for ${vehicleType}!`, 'success');
    
    document.getElementById('carNumber').value = '';
    document.getElementById('duration').value = '2';
}

// Update slot display for the given vehicle type
function updateSlotDisplay(slotNumber, status, carNumber, vehicleType) {
    const slots = getSlotsForType(vehicleType);
    const slotElement = document.querySelector(`.slot:nth-child(${slotNumber})`);
    if (slotElement) {
        slotElement.className = `slot ${status}`;
        if (status === 'occupied') {
            slotElement.innerHTML = `${slotNumber}<div class="car-info">${carNumber}</div>`;
            slotElement.title = `Slot ${slotNumber} - Occupied by ${carNumber}`;
        } else {
            slotElement.textContent = slotNumber;
            slotElement.title = `Slot ${slotNumber} - Available`;
        }
    }
}

// Search vehicle
function searchVehicle() {
    const searchCar = document.getElementById('searchCar').value.trim().toUpperCase();
    const resultDiv = document.getElementById('searchResult');

    if (!searchCar) {
        resultDiv.innerHTML = '<p style="color: #fff; margin-top: 10px;">Please enter a car number to search.</p>';
        return;
    }

    if (parkingData.parkedVehicles[searchCar]) {
        const vehicle = parkingData.parkedVehicles[searchCar];
        const realTimeDuration = calculateRealTimeDuration(vehicle.checkInTime);
        const currentDuration = calculateCurrentDuration(vehicle.checkInTime);
        const currentHours = parseFloat(currentDuration.split(' ')[2].replace('billed', '')) || 0;
        const currentCost = calculateCost(vehicle.type, currentHours);
        resultDiv.innerHTML = `
            <div style="background: rgba(255,255,255,0.9); color: #333; padding: 15px; border-radius: 8px; margin-top: 15px; word-break: break-all;">
                <h4>🚗 Vehicle Found!</h4>
                <p><strong>Car Number:</strong> ${searchCar}</p>
                <p><strong>Slot Number:</strong> ${vehicle.slotNumber}</p>
                <p><strong>Vehicle Type:</strong> ${vehicle.type}</p>
                <p><strong>Parked Since:</strong> ${new Date(vehicle.checkInTime).toLocaleString()}</p>
                <p><strong>Current Duration:</strong> ${realTimeDuration}</p>
                <p><strong>Current Estimated Cost:</strong> ₹${currentCost}</p>
            </div>
        `;
        
        const slotElement = document.querySelector(`.slot:nth-child(${vehicle.slotNumber})`);
        if (slotElement) {
            slotElement.style.animation = 'pulse 1s infinite';
            setTimeout(() => {
                slotElement.style.animation = '';
            }, 3000);
        }
    } else {
        resultDiv.innerHTML = `
            <div style="background: rgba(255,255,255,0.9); color: #721c24; padding: 15px; border-radius: 8px; margin-top: 15px;">
                <h4>❌ Vehicle Not Found</h4>
                <p>No vehicle with number <strong>${searchCar}</strong> is currently parked.</p>
            </div>
        `;
    }
}

// Check-out vehicle
function checkOutVehicle() {
    const carNumber = document.getElementById('checkoutCar').value.trim().toUpperCase();

    if (!carNumber) {
        showAlert('Please enter a valid car number!', 'danger');
        return;
    }

    if (!parkingData.parkedVehicles[carNumber]) {
        showAlert('Vehicle not found in parking records!', 'danger');
        return;
    }

    const vehicle = parkingData.parkedVehicles[carNumber];
    const slotNumber = vehicle.slotNumber;
    const checkInTimeStr = vehicle.checkInTime;
    const checkOutTime = new Date().toISOString();
    const vehicleType = vehicle.type;
    const slots = getSlotsForType(vehicleType);
    
    const checkInTimeObj = new Date(checkInTimeStr);
    const checkOutTimeObj = new Date(checkOutTime);
    if (isNaN(checkInTimeObj.getTime()) || isNaN(checkOutTimeObj.getTime())) {
        showAlert('Invalid check-in time detected!', 'danger');
        return;
    }
    let diffMs = Math.max(0, checkOutTimeObj - checkInTimeObj);
    let diffMinutes = Math.ceil(diffMs / (1000 * 60));
    let billedMinutes, actualHours, actualCost;

    if (diffMinutes <= 60) {
        billedMinutes = 60;
        actualHours = 1.00;
        actualCost = parkingData.rates[vehicle.type];
    } else {
        const extraMinutes = diffMinutes - 60;
        const incrementMinutes = parkingData.billingIncrement;
        const additionalBilledMinutes = Math.ceil(extraMinutes / incrementMinutes) * incrementMinutes;
        billedMinutes = 60 + additionalBilledMinutes;
        actualHours = (billedMinutes / 60).toFixed(2);
        actualCost = parkingData.rates[vehicle.type] + (parkingData.rates[vehicle.type] * (additionalBilledMinutes / 60));
    }
    
    const durationDisplay = `${billedMinutes} minute${billedMinutes !== 1 ? 's' : ''} (${actualHours} billed hours)`;

    // Store checkout data in history
    parkingData.history.push({
        carNumber,
        vehicleType: vehicle.type,
        checkInTime: checkInTimeStr,
        checkOutTime,
        billedHours: parseFloat(actualHours),
        totalCost: actualCost
    });

    slots[slotNumber] = { status: 'empty', vehicle: null };
    delete parkingData.parkedVehicles[carNumber];

    saveParkingData();

    updateSlotDisplay(slotNumber, 'empty', null, vehicleType);
    updateStats(vehicleType);
    
    generateCheckoutReceipt(carNumber, slotNumber, vehicle.type, checkInTimeStr, checkOutTime, durationDisplay, actualHours, actualCost);
    
    showAlert(`Vehicle ${carNumber} successfully checked out from slot ${slotNumber}! Total cost: ₹${actualCost}`, 'success');
    
    document.getElementById('checkoutCar').value = '';
}

// Helper function to calculate cost
function calculateCost(vehicleType, hours) {
    if (hours <= 1) return parkingData.rates[vehicleType];
    const extraHours = hours - 1;
    const incrementHours = parkingData.billingIncrement / 60;
    const additionalBilledHours = Math.ceil(extraHours / incrementHours) * incrementHours;
    return parkingData.rates[vehicleType] + (parkingData.rates[vehicleType] * additionalBilledHours);
}

// Generate check-in receipt
function generateReceipt(carNumber, slotNumber, vehicleType, checkInTime, expectedCost) {
    const receiptHTML = `
        <div class="receipt" id="checkinReceipt">
            <div class="receipt-header">
                <h3>🎫 PARKING RECEIPT</h3>
                <p>Smart Parking Management System</p>
                <div class="receipt-separator">||||||||||||||||||||</div>
            </div>
            <div class="receipt-item">
                <span>Car Number:</span>
                <span><strong>${carNumber}</strong></span>
            </div>
            <div class="receipt-item">
                <span>Slot Number:</span>
                <span><strong>${slotNumber}</strong></span>
            </div>
            <div class="receipt-item">
                <span>Vehicle Type:</span>
                <span>${vehicleType.toUpperCase()}</span>
            </div>
            <div class="receipt-item">
                <span>Check-in Time:</span>
                <span>${new Date(checkInTime).toLocaleString()}</span>
            </div>
            <div class="receipt-item">
                <span>Rate:</span>
                <span>₹${parkingData.rates[vehicleType]}/hour</span>
            </div>
            <div class="receipt-item receipt-total">
                <span>Expected Cost:</span>
                <span><strong>₹${expectedCost}</strong></span>
            </div>
            <div class="receipt-separator">||||||||||||||||||||</div>
            <p style="text-align: center; margin-top: 15px; font-size: 12px; color: #666;">
                Please keep this receipt safe. You'll need your car number for checkout.
            </p>
            <div class="receipt-actions">
                <button class="btn-print" onclick="printReceipt('checkinReceipt')">🖨️ Print Receipt</button>
                <button class="btn-print btn-print-small" onclick="downloadReceipt('checkinReceipt', '${carNumber}_checkin')">💾 Download</button>
            </div>
        </div>
    `;
    
    document.getElementById('receiptContainer').innerHTML = receiptHTML;
}

// Generate checkout receipt
function generateCheckoutReceipt(carNumber, slotNumber, vehicleType, checkInTime, checkOutTime, durationDisplay, billedHours, totalCost) {
    const safeCarNumber = carNumber || 'N/A';
    const safeSlotNumber = slotNumber || 'N/A';
    const safeVehicleType = vehicleType || 'car';
    const safeCheckInTime = new Date(checkInTime).toLocaleString() || 'N/A';
    const safeCheckOutTime = new Date(checkOutTime).toLocaleString() || 'N/A';
    const safeDurationDisplay = durationDisplay || '60 minutes (1.00 billed hours)';
    const safeBilledHours = billedHours || 1.00;
    const safeTotalCost = totalCost || parkingData.rates[safeVehicleType];
    const safeHourlyRate = parkingData.rates[safeVehicleType] || 60;

    const receiptHTML = `
        <div class="receipt" id="checkoutReceipt">
            <div class="receipt-header">
                <h3>🚗 CHECKOUT RECEIPT</h3>
                <p>Thank you for using our parking service!</p>
                <div class="receipt-separator">||||||||||||||||||||</div>
            </div>
            <div class="receipt-item">
                <span>Car Number:</span>
                <span><strong>${safeCarNumber}</strong></span>
            </div>
            <div class="receipt-item">
                <span>Slot Number:</span>
                <span><strong>${safeSlotNumber}</strong></span>
            </div>
            <div class="receipt-item">
                <span>Vehicle Type:</span>
                <span>${safeVehicleType.toUpperCase()}</span>
            </div>
            <div class="receipt-item">
                <span>Check-in Time:</span>
                <span>${safeCheckInTime}</span>
            </div>
            <div class="receipt-item">
                <span>Check-out Time:</span>
                <span>${safeCheckOutTime}</span>
            </div>
            <div class="receipt-item">
                <span>Duration:</span>
                <span>${safeDurationDisplay}</span>
            </div>
            <div class="receipt-item">
                <span>Rate:</span>
                <span>₹${safeHourlyRate}/hour</span>
            </div>
            <div class="receipt-item receipt-total">
                <span>Total Amount:</span>
                <span><strong>₹${safeTotalCost.toFixed(2)}</strong></span>
            </div>
            <div class="receipt-separator">||||||||||||||||||||</div>
            <p style="text-align: center; margin-top: 15px; font-size: 12px; color: #666;">
                Safe Drive! Come Again.
            </p>
            <div class="receipt-actions">
                <button class="btn-print" onclick="printReceipt('checkoutReceipt')">🖨️ Print Receipt</button>
                <button class="btn-print btn-print-small" onclick="printReceipt('checkoutReceipt', true)">🖨️ Print Small</button>
                <button class="btn-print btn-print-small" onclick="downloadReceipt('checkoutReceipt', '${safeCarNumber}_checkout')">💾 Download</button>
            </div>
        </div>
    `;
    
    document.getElementById('receiptContainer').innerHTML = receiptHTML;
}

// Download receipt as image
function downloadReceipt(receiptId, filename) {
    const receiptElement = document.getElementById(receiptId);
    html2canvas(receiptElement).then(canvas => {
        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

// Print receipt
function printReceipt(receiptId, isSmall = false) {
    const receiptElement = document.getElementById(receiptId);
    const printWindow = window.open('', '_blank', isSmall ? 'width=300,height=600' : '');
    printWindow.document.write(`
        <html>
        <head>
            <title>Print Receipt</title>
            <style>
                body { font-family: 'Courier New', monospace; margin: 0; padding: 10px; ${isSmall ? 'font-size: 12px;' : ''} }
                .receipt { border: none; padding: 0; }
                .receipt-actions { display: none; }
            </style>
        </head>
        <body>${receiptElement.outerHTML}</body>
        </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

// Print parking report
function printParkingReport() {
    const occupiedVehicles = Object.entries(parkingData.parkedVehicles);
    
    let reportHTML = `
        <div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px;">
                <h2>🅿️ Current Parking Status Report</h2>
                <p>Generated on: ${new Date().toLocaleString()}</p>
                <p>Total Occupied Slots: ${occupiedVehicles.length}</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                    <tr style="background-color: #f0f0f0; border-bottom: 2px solid #333;">
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Slot Number</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Car Number</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Vehicle Type</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Check-in Time</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Current Duration</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Current Cost</th>
                    </tr>
                </thead>
                <tbody>
    `;

    let totalRevenue = 0;
    occupiedVehicles.forEach(([carNumber, vehicle]) => {
        const currentDuration = calculateCurrentDuration(vehicle.checkInTime);
        const currentHours = parseFloat(currentDuration.split(' ')[2].replace('billed', '')) || 0;
        const currentCost = calculateCost(vehicle.type, currentHours);
        totalRevenue += currentCost;
        reportHTML += `
            <tr>
                <td style="border: 1px solid #333; padding: 8px;">${vehicle.slotNumber}</td>
                <td style="border: 1px solid #333; padding: 8px; font-weight: bold;">${carNumber}</td>
                <td style="border: 1px solid #333; padding: 8px;">${vehicle.type.toUpperCase()}</td>
                <td style="border: 1px solid #333; padding: 8px;">${new Date(vehicle.checkInTime).toLocaleString()}</td>
                <td style="border: 1px solid #333; padding: 8px;">${currentDuration}</td>
                <td style="border: 1px solid #333; padding: 8px;">₹${currentCost}</td>
            </tr>
        `;
    });

    reportHTML += `
                </tbody>
            </table>
            
            <div style="margin-top: 30px; text-align: right; border-top: 2px solid #333; padding-top: 20px;">
                <h3>Total Current Revenue: ₹${totalRevenue}</h3>
            </div>
        </div>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Parking Status Report</title>
            <style>
                body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
                @media print {
                    body { padding: 0; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                }
            </style>
        </head>
        <body>
            ${reportHTML}
        </body>
        </html>
    `);
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = function() {
            printWindow.close();
        };
    }, 500);
    
    showAlert('Parking report sent to printer!', 'success');
}

// Show alert messages
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    const alertClass = type === 'success' ? 'alert-success' : (type === 'danger' ? 'alert-danger' : 'alert-info');
    
    const alertHTML = `
        <div class="alert ${alertClass}">
            ${message}
        </div>
    `;
    
    alertContainer.innerHTML = alertHTML;
    
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 5000);
}

// Update live clock
function updateLiveClock() {
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    document.getElementById('liveClock').textContent = `Easy Parking With Smart Slot Allocation | ${now}`;
}

// Analytics function
function showAnalytics() {
    const analyticsContainer = document.getElementById('analyticsContainer');
    analyticsContainer.style.display = 'block';
    
    // Calculate revenue by vehicle type
    const revenueByType = parkingData.history.reduce((acc, entry) => {
        acc[entry.vehicleType] = (acc[entry.vehicleType] || 0) + entry.totalCost;
        return acc;
    }, { car: 0, bike: 0, truck: 0 });

    // Calculate occupancy by hour across all types
    const occupancyByHour = Array(24).fill(0);
    parkingData.history.forEach(entry => {
        const checkInHour = new Date(entry.checkInTime).getHours();
        const checkOutHour = new Date(entry.checkOutTime).getHours();
        for (let i = checkInHour; i <= checkOutHour; i++) {
            occupancyByHour[i % 24]++;
        }
    });

    // Find peak hours
    const maxOccupancy = Math.max(...occupancyByHour);
    const peakHours = occupancyByHour.reduce((acc, count, hour) => {
        if (count === maxOccupancy && maxOccupancy > 0) {
            acc.push(`${hour}:00-${hour + 1}:00`);
        }
        return acc;
    }, []).join(', ') || 'None';

    // Render analytics dashboard
    analyticsContainer.innerHTML = `
        <h3>📈 Parking Analytics Dashboard</h3>
        <div style="margin-bottom: 20px;">
            <h4>Revenue by Vehicle Type</h4>
            <canvas id="revenueChart"></canvas>
        </div>
        <div style="margin-bottom: 20px;">
            <h4>Occupancy by Hour</h4>
            <canvas id="occupancyChart"></canvas>
        </div>
        <div>
            <h4>Peak Hours: ${peakHours}</h4>
            <p>Total Revenue: ₹${Object.values(revenueByType).reduce((a, b) => a + b, 0)}</p>
        </div>
        <button class="btn" onclick="document.getElementById('analyticsContainer').style.display='none'">Close Analytics</button>
    `;

    // Render revenue pie chart
    const revenueCtx = document.getElementById('revenueChart').getContext('2d');
    new Chart(revenueCtx, {
        type: 'pie',
        data: {
            labels: ['Car', 'Bike', 'Truck'],
            datasets: [{
                data: [revenueByType.car, revenueByType.bike, revenueByType.truck],
                backgroundColor: ['#0072ff', '#27ae60', '#e74c3c']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top'
                }
            }
        }
    });

    // Render occupancy bar chart
    const occupancyCtx = document.getElementById('occupancyChart').getContext('2d');
    new Chart(occupancyCtx, {
        type: 'bar',
        data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            datasets: [{
                label: 'Vehicles Parked',
                data: occupancyByHour,
                backgroundColor: '#0072ff'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Vehicles'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Hour of Day'
                    }
                }
            }
        }
    });
}

// Toggle parking history visibility
function toggleParkingHistory() {
    const historyContainer = document.getElementById('parkingHistoryContainer');
    if (historyContainer.style.display === 'none' || historyContainer.style.display === '') {
        displayParkingHistory();
        historyContainer.style.display = 'block';
    } else {
        historyContainer.style.display = 'none';
    }
}

// Display parking history
function displayParkingHistory() {
    const historyContainer = document.getElementById('parkingHistoryContainer');
    if (parkingData.history.length === 0) {
        historyContainer.innerHTML = '<p>No parking history available.</p>';
        return;
    }

    let historyHTML = `
        <table>
            <thead>
                <tr>
                    <th>Car Number</th>
                    <th>Vehicle Type</th>
                    <th>Check-in Time</th>
                    <th>Check-out Time</th>
                    <th>Billed Hours</th>
                    <th>Total Cost (₹)</th>
                </tr>
            </thead>
            <tbody>
    `;

    parkingData.history.forEach(entry => {
        historyHTML += `
            <tr>
                <td>${entry.carNumber}</td>
                <td>${entry.vehicleType.toUpperCase()}</td>
                <td>${new Date(entry.checkInTime).toLocaleString()}</td>
                <td>${new Date(entry.checkOutTime).toLocaleString()}</td>
                <td>${entry.billedHours.toFixed(2)}</td>
                <td>${entry.totalCost.toFixed(2)}</td>
            </tr>
        `;
    });

    historyHTML += `
            </tbody>
        </table>
    `;

    historyContainer.innerHTML = historyHTML;
}

// Print parking history
function printParkingHistory() {
    const historyContainer = document.getElementById('parkingHistoryContainer');
    
    if (parkingData.history.length === 0) {
        showAlert('No parking history available to print!', 'danger');
        return;
    }

    let historyHTML = `
        <div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px;">
                <h2>📜 Parking History Report</h2>
                <p>Generated on: ${new Date().toLocaleString()}</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                    <tr style="background-color: #f0f0f0; border-bottom: 2px solid #333;">
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Car Number</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Vehicle Type</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Check-in Time</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Check-out Time</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Billed Hours</th>
                        <th style="border: 1px solid #333; padding: 12px; text-align: left;">Total Cost (₹)</th>
                    </tr>
                </thead>
                <tbody>
    `;

    parkingData.history.forEach(entry => {
        historyHTML += `
            <tr>
                <td style="border: 1px solid #333; padding: 8px; font-weight: bold;">${entry.carNumber}</td>
                <td style="border: 1px solid #333; padding: 8px;">${entry.vehicleType.toUpperCase()}</td>
                <td style="border: 1px solid #333; padding: 8px;">${new Date(entry.checkInTime).toLocaleString()}</td>
                <td style="border: 1px solid #333; padding: 8px;">${new Date(entry.checkOutTime).toLocaleString()}</td>
                <td style="border: 1px solid #333; padding: 8px;">${entry.billedHours.toFixed(2)}</td>
                <td style="border: 1px solid #333; padding: 8px;">${entry.totalCost.toFixed(2)}</td>
            </tr>
        `;
    });

    historyHTML += `
                </tbody>
            </table>
        </div>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Parking History Report</title>
            <style>
                body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: white; }
                @media print {
                    body { padding: 0; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                }
            </style>
        </head>
        <body>
            ${historyHTML}
        </body>
        </html>
    `);
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = function() {
            printWindow.close();
        };
    }, 500);
    
    showAlert('Parking history sent to printer!', 'success');
}

// Initialize the parking system when the page loads
document.addEventListener('DOMContentLoaded', function() {
    loadParkingData();
    const initialType = document.getElementById('vehicleType').value;
    initializeParkingSlots(initialType);
    
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    
    document.getElementById('carNumber').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkInVehicle();
        }
    });
    
    document.getElementById('searchCar').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchVehicle();
        }
    });
    
    document.getElementById('checkoutCar').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkOutVehicle();
        }
    });

    // Initialize Tesseract
    initTesseract();

    // Camera functionality
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const captureBtn = document.getElementById('captureBtn');
    const takePhoto = document.getElementById('takePhoto');
    const cameraContainer = document.getElementById('cameraContainer');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadPlate = document.getElementById('uploadPlate');
    let stream;

    captureBtn.onclick = () => {
        cameraContainer.style.display = 'block';
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(s => {
                stream = s;
                video.srcObject = stream;
                video.play();
            })
            .catch(err => {
                console.error('Error accessing camera:', err);
                showAlert('Unable to access camera. Please check permissions.', 'danger');
            });
    };

    takePhoto.onclick = async () => {
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        cameraContainer.style.display = 'none';
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        await recognizePlate();
    };

    // Upload functionality for demo
    uploadBtn.onclick = () => {
        uploadPlate.click();
    };

    uploadPlate.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = async () => {
                const ctx = canvas.getContext('2d');
                // Clear canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                // Draw image, scaling to fit canvas while maintaining aspect ratio
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const width = img.width * scale;
                const height = img.height * scale;
                const x = (canvas.width - width) / 2;
                const y = (canvas.height - height) / 2;
                ctx.drawImage(img, x, y, width, height);
                await recognizePlate();
            };
        }
    });
});

// Recognize plate using OCR
async function recognizePlate() {
    try {
        const { data: { text } } = await tesseractWorker.recognize(document.getElementById('canvas').toDataURL('image/png'));
        const cleanedText = text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        document.getElementById('carNumber').value = cleanedText;
        checkInVehicle();  // Automatically check in after recognition
    } catch (err) {
        console.error('OCR error:', err);
        showAlert('Failed to recognize number plate. Please try again or enter manually.', 'danger');
    }
}

// Additional utility functions
function resetParkingSystem() {
    if (confirm('Are you sure you want to reset all parking data? This will clear all vehicles and reset all slots.')) {
        parkingData.slotsCar = {};
        parkingData.slotsBike = {};
        parkingData.slotsTruck = {};
        parkingData.parkedVehicles = {};
        parkingData.history = [];
        localStorage.removeItem('parkingData');
        initializeParkingSlots(document.getElementById('vehicleType').value);
        document.getElementById('receiptContainer').innerHTML = '';
        document.getElementById('alertContainer').innerHTML = '';
        document.getElementById('searchResult').innerHTML = '';
        document.getElementById('analyticsContainer').style.display = 'none';
        document.getElementById('parkingHistoryContainer').style.display = 'none';
        document.getElementById('parkingHistoryContainer').innerHTML = '';
        showAlert('Parking system has been reset successfully!', 'success');
    }
}

// Export parking data
function exportParkingData() {
    const data = {
        timestamp: new Date().toISOString(),
        totalSlots: parkingData.totalSlots,
        slotsCar: parkingData.slotsCar,
        slotsBike: parkingData.slotsBike,
        slotsTruck: parkingData.slotsTruck,
        parkedVehicles: parkingData.parkedVehicles,
        history: parkingData.history
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `parking_data_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

// Import parking data from file
function importParkingData(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.parkedVehicles) {
                    parkingData.slotsCar = data.slotsCar || {};
                    parkingData.slotsBike = data.slotsBike || {};
                    parkingData.slotsTruck = data.slotsTruck || {};
                    parkingData.parkedVehicles = data.parkedVehicles;
                    parkingData.history = data.history || [];
                    
                    for (let i = 1; i <= parkingData.totalSlots.car; i++) {
                        if (!parkingData.slotsCar[i]) parkingData.slotsCar[i] = { status: 'empty', vehicle: null };
                    }
                    for (let i = 1; i <= parkingData.totalSlots.bike; i++) {
                        if (!parkingData.slotsBike[i]) parkingData.slotsBike[i] = { status: 'empty', vehicle: null };
                    }
                    for (let i = 1; i <= parkingData.totalSlots.truck; i++) {
                        if (!parkingData.slotsTruck[i]) parkingData.slotsTruck[i] = { status: 'empty', vehicle: null };
                    }
                    
                    Object.entries(parkingData.parkedVehicles).forEach(([carNumber, vehicle]) => {
                        const slots = getSlotsForType(vehicle.type);
                        if (vehicle.slotNumber && vehicle.slotNumber <= parkingData.totalSlots[vehicle.type]) {
                            slots[vehicle.slotNumber] = {
                                status: 'occupied',
                                vehicle: carNumber
                            };
                        }
                    });
                    
                    initializeParkingSlots(document.getElementById('vehicleType').value);
                    Object.entries(parkingData.parkedVehicles).forEach(([carNumber, vehicle]) => {
                        if (vehicle.slotNumber) {
                            updateSlotDisplay(vehicle.slotNumber, 'occupied', carNumber, vehicle.type);
                        }
                    });
                    
                    saveParkingData();
                    showAlert('Parking data imported successfully!', 'success');
                }
            } catch (error) {
                showAlert('Error importing parking data. Please check the file format.', 'danger');
            }
        };
        reader.readAsText(file);
    }
}