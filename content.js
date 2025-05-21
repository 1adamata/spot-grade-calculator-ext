function waitForGradesAndCalculate() {
    const interval = setInterval(() => {
        const gradeDiv = document.getElementById('2024_year_overiew_div'); // Main grades table container
        if (gradeDiv) {
            clearInterval(interval);
            calculateAndDisplayPerCourseRequirements(gradeDiv);
        }
    }, 500);
}

function calculateAndDisplayPerCourseRequirements(gradeDiv) {
    const headerRow = gradeDiv.querySelector('thead tr');
    const newHeaderId = 'unit-target-info-header'; // Changed ID for clarity

    if (headerRow && !document.getElementById(newHeaderId)) {
        const newHeaderCell = document.createElement('th');
        newHeaderCell.id = newHeaderId;
        newHeaderCell.innerText = "Unit Target Info"; // Broader title
        newHeaderCell.style.textAlign = "center";
        headerRow.appendChild(newHeaderCell);
    }

    const rows = gradeDiv.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length < 6) return;

        const courseIdText = tds[0]?.innerText.trim().replace(/\s+/g, ''); // Get and clean course ID like "COMP11212"
        const detailDivId = `2024_${courseIdText}_course_overiew_div`;
        const courseDetailDiv = document.getElementById(detailDivId);

        let messageForMainTable = "";

        if (courseDetailDiv) {
            messageForMainTable = processCourseDetail(courseDetailDiv, tds);
        } else {
            messageForMainTable = calculateSimpleExamRequirement(tds, null, null, true); // Pass true for isFallback
        }
        
        const newDataCellClass = 'unit-target-info-data'; // Changed class for clarity
        let resultCell = row.querySelector('.' + newDataCellClass);
        if (!resultCell) {
            resultCell = row.insertCell(-1);
            resultCell.classList.add(newDataCellClass);
        }
        resultCell.innerText = messageForMainTable;
        resultCell.style.textAlign = "left";
        resultCell.style.fontSize = "0.9em"; // Potentially longer messages
    });
}

function processCourseDetail(courseDetailDiv, mainTableRowTds) {
    let achievedWeightedScoreInCW = 0; // Sum of (item_percent * item_internal_weight_of_total_cw)
    let totalMarkedCWItemInternalWeight = 0;
    let totalUnmarkedCWItemInternalWeight = 0;

    let unitCwWeight = 0, unitExamWeight = 0;
    // Try to get unit CW/Exam weights from the detail div's header text
    const detailHtml = courseDetailDiv.innerHTML; // Use innerHTML for regex matching across simple tags
    const unitWeightsMatch = detailHtml.match(/Coursework:\s*(\d+)%.*?Exam:\s*(\d+)%/i);

    if (unitWeightsMatch) {
        unitCwWeight = parseFloat(unitWeightsMatch[1]) / 100;
        unitExamWeight = parseFloat(unitWeightsMatch[2]) / 100;
    } else { // Fallback to main table if not found in detail div's text
        const CwExamRatioText = mainTableRowTds[2]?.innerText.trim();
        const parts = CwExamRatioText.split('/');
        if (parts.length === 2) {
            unitCwWeight = parseFloat(parts[0]) / 100;
            unitExamWeight = parseFloat(parts[1]) / 100;
            if(isNaN(unitCwWeight) || isNaN(unitExamWeight)) {
                return "Error: Unit CW/Exam weights invalid.";
            }
        } else {
            return "Error: Unit CW/Exam weights not found.";
        }
    }
    
    if (isNaN(unitCwWeight) || isNaN(unitExamWeight)) return "Error: Unit CW/Exam weights not properly parsed.";


    const cwItemRows = courseDetailDiv.querySelectorAll('#table_summative_assessments tbody tr');
    // Iterate over CW item rows (typically, first is header, last is CW summary)
    for (let i = 0; i < cwItemRows.length; i++) {
        const itemRow = cwItemRows[i];
        // Skip if it's clearly a header or footer row of the inner table based on <th> presence
        if (itemRow.querySelector('th')) continue;
        
        const cells = itemRow.querySelectorAll('td');
        if (cells.length < 5) continue; // Expect at least 5 cells for a data row

        const weightText = cells[1]?.innerText.trim();
        const gradeText = cells[4]?.innerText.trim();
        
        const itemInternalWeight = parseFloat(weightText) / 100;

        if (isNaN(itemInternalWeight) || itemInternalWeight <=0 ) continue; // Skip if no valid weight

        if (gradeText.includes('%') && !gradeText.includes('needs marked')) {
            const markMatch = gradeText.match(/\((\d+\.?\d*)%\)/);
            if (markMatch && markMatch[1]) {
                const itemPercent = parseFloat(markMatch[1]);
                if (!isNaN(itemPercent)) {
                    achievedWeightedScoreInCW += itemPercent * itemInternalWeight;
                    totalMarkedCWItemInternalWeight += itemInternalWeight;
                }
            }
        } else if (gradeText.toLowerCase().includes('needs marked')) {
            totalUnmarkedCWItemInternalWeight += itemInternalWeight;
        }
    }
    
    // Rounding weights to avoid floating point issues for sum check
    totalMarkedCWItemInternalWeight = parseFloat(totalMarkedCWItemInternalWeight.toFixed(4));
    totalUnmarkedCWItemInternalWeight = parseFloat(totalUnmarkedCWItemInternalWeight.toFixed(4));

    let detailMessageToInject = ""; // Message for the detail div
    let messageForMainTable = "";   // Message for the main summary table

    const currentOverallCwFromMainTable = parseFloat(mainTableRowTds[3]?.innerText.trim()); // For reference

    if (totalUnmarkedCWItemInternalWeight > 0) {
        const mainTableExamPercentText = mainTableRowTds[4]?.innerText.trim();
        const mainTableExamPercent = parseFloat(mainTableExamPercentText);
        
        const assumedExamTargetForCalc = (mainTableExamPercentText !== "0" && !isNaN(mainTableExamPercent) && mainTableExamPercent > 0) 
                                         ? mainTableExamPercent 
                                         : 40; // Assume 40% on exam if not taken/marked

        let neededOverallCwPercentForUnit = 0;
        if (unitCwWeight > 0) {
            neededOverallCwPercentForUnit = (40 - (assumedExamTargetForCalc * unitExamWeight)) / unitCwWeight;
        } else { // 0% CW for unit, means 100% exam or error
             detailMessageToInject = (unitExamWeight > 0) ? "This unit is weighted 0% on Coursework." : "Error: Unit CW weight is 0%.";
             // Message for main table will be handled by simple calculator if exam is the only component
        }

        if (unitCwWeight > 0) { // Only if CW contributes to the unit
            if (neededOverallCwPercentForUnit < 0) {
                detailMessageToInject = `With exam at ${assumedExamTargetForCalc}%, unit target of 40% is already met/exceeded by exam alone.`;
            } else if (neededOverallCwPercentForUnit > 100) {
                detailMessageToInject = `To get 40% in unit (with exam at ${assumedExamTargetForCalc}%), an overall CW score of >100% (${neededOverallCwPercentForUnit.toFixed(2)}%) would be needed. Likely unachievable.`;
            } else {
                const neededScoreFromRemainingCwComponent = neededOverallCwPercentForUnit - achievedWeightedScoreInCW;
                
                const neededAvgOnUnmarkedCw = neededScoreFromRemainingCwComponent / totalUnmarkedCWItemInternalWeight;

                if (neededAvgOnUnmarkedCw > 100) {
                    detailMessageToInject = `For 40% unit (assuming ${assumedExamTargetForCalc}% exam): Need avg >100% (${neededAvgOnUnmarkedCw.toFixed(2)}%) on the remaining ${totalUnmarkedCWItemInternalWeight*100}% of CW.`;
                } else if (neededAvgOnUnmarkedCw < 0) {
                     detailMessageToInject = `For 40% unit (assuming ${assumedExamTargetForCalc}% exam): Your current marked CW (avg ${ (totalMarkedCWItemInternalWeight > 0 ? (achievedWeightedScoreInCW / totalMarkedCWItemInternalWeight) : 0).toFixed(2) }%) is sufficient if exam target met.`;
                } else {
                    detailMessageToInject = `For 40% unit (assuming ${assumedExamTargetForCalc}% exam): Need avg ${neededAvgOnUnmarkedCw.toFixed(2)}% on the remaining ${totalUnmarkedCWItemInternalWeight*100}% of CW.`;
                }
            }
        }
        
        // Add/Update the message in the course detail div
        let resultsP = courseDetailDiv.querySelector('.cw-grade-calculator-result-detail');
        if (!resultsP) {
            resultsP = document.createElement('p');
            resultsP.className = 'cw-grade-calculator-result-detail';
            resultsP.style.fontWeight = 'bold';
            resultsP.style.marginTop = '10px';
            resultsP.style.color = '#0056b3'; // Or another distinct color
            const hrElement = Array.from(courseDetailDiv.querySelectorAll('hr')).pop(); // last hr
            if (hrElement) {
                hrElement.parentNode.insertBefore(resultsP, hrElement.nextSibling); // After last hr
            } else {
                 const unitMarkP = Array.from(courseDetailDiv.querySelectorAll('p')).find(p => p.innerText.includes("Unit Mark:"));
                 if(unitMarkP) courseDetailDiv.insertBefore(resultsP, unitMarkP);
                 else courseDetailDiv.appendChild(resultsP);
            }
        }
        resultsP.innerHTML = detailMessageToInject; // Use innerHTML if you want to include HTML tags in message

        // Now, prepare message for the main table (based on current overall CW)
        messageForMainTable = calculateSimpleExamRequirement(mainTableRowTds, unitCwWeight, unitExamWeight, false);
        if (messageForMainTable.includes("Need") || messageForMainTable.includes("Below 40%")) {
             messageForMainTable += " (See details for CW targets)";
        } else if (messageForMainTable.includes("sufficient") || messageForMainTable.includes("achieved")) {
             messageForMainTable += " (Details in course view)";
        }


    } else { // All CW is marked or no unmarked found
        messageForMainTable = calculateSimpleExamRequirement(mainTableRowTds, unitCwWeight, unitExamWeight, false);
         if (totalMarkedCWItemInternalWeight > 0 && Math.abs(totalMarkedCWItemInternalWeight - 1.0) > 0.01 && Math.abs(totalMarkedCWItemInternalWeight - 0) > 0.01) { // If sum of weights not 100% or 0%
            messageForMainTable += ` (Note: Parsed CW item weights sum to ${ (totalMarkedCWItemInternalWeight*100).toFixed(0) }%, not 100%.)`;
        }
    }
    return messageForMainTable;
}

function calculateSimpleExamRequirement(mainTableRowTds, unitCwW, unitExW, isFallback) {
    // isFallback: true if called because detailDiv wasn't found.
    // unitCwW, unitExW: unit weights, can be null if isFallback, then parse from mainTable.
    const examMarkText = mainTableRowTds[4]?.innerText.trim();
    const courseworkMarkText = mainTableRowTds[3]?.innerText.trim(); // This is Overall CW% from main table
    
    let CwExamRatioText, cwWeight, examWeight;

    if (unitCwW !== null && unitExW !== null && !isNaN(unitCwW) && !isNaN(unitExW)) {
        cwWeight = unitCwW;
        examWeight = unitExW;
    } else { // Parse from main table's CW/EXAM column
        CwExamRatioText = mainTableRowTds[2]?.innerText.trim();
        const parts = CwExamRatioText.split('/');
        if (parts.length === 2) {
            cwWeight = parseFloat(parts[0]) / 100;
            examWeight = parseFloat(parts[1]) / 100;
        } else {
            return isFallback ? "Ratio err" : "Error: CW/Exam ratio parse error.";
        }
    }
    
    if (isNaN(cwWeight) || isNaN(examWeight)) return isFallback ? "Weight err" : "Error: Invalid CW/Exam weights.";

    let message = isFallback ? "N/A" : "Status N/A";

    if (examMarkText === "0") { // Exam not yet taken
        const courseworkMark = parseFloat(courseworkMarkText); // Current overall CW%
        if (!isNaN(courseworkMark)) {
            if (examWeight > 0) { // If there's an exam component
                const currentCwContributionToUnit = courseworkMark * cwWeight;
                const requiredExamContributionToUnit = 40 - currentCwContributionToUnit;

                if (requiredExamContributionToUnit <= 0) { // CW alone is enough for 40% unit
                    message = `CW (${courseworkMark}%) sufficient for 40% unit.`;
                } else {
                    const neededExamPercent = requiredExamContributionToUnit / examWeight;
                    if (neededExamPercent > 100) message = `Need >100% (${neededExamPercent.toFixed(2)}%) on exam.`;
                    else if (neededExamPercent < 0) message = `CW (${courseworkMark}%) sufficient for 40% unit.`; // Should be caught above
                    else message = `Need ${neededExamPercent.toFixed(2)}% on exam.`;
                }
            } else { // 100% CW course (examWeight is 0)
                if (courseworkMark >= 40) message = `40%+ achieved (100% CW at ${courseworkMark}%).`;
                else message = `Below 40% (is ${courseworkMark.toFixed(2)}%, 100% CW).`;
            }
        } else message = isFallback ? "CW% err" : "Error: Invalid Overall CW%.";
    } else { // Exam has a mark, or text isn't "0"
        const credits = parseFloat(mainTableRowTds[1]?.innerText.trim());
        const examMark = parseFloat(examMarkText);
        if (credits === 0 && parseFloat(mainTableRowTds[5]?.innerText.trim()) === 0) message = "0 credit unit.";
        else if (!isNaN(examMark) && examMark > 0) message = "Exam taken.";
        else message = isFallback ? "Exam status?" : "Exam status unclear or N/A.";
    }
    return message;
}

// Start the process
waitForGradesAndCalculate();