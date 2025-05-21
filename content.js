function waitForGradesAndCalculate() {
    const interval = setInterval(() => {
        // Dynamically find the main grade div, assuming its ID ends with "_year_overiew_div"
        // and it's not one of the individual course overview divs.
        const gradeDiv = document.querySelector('div[id$="_year_overiew_div"]:not([id*="_course_overiew_div"])');
        
        // A simpler selector if the above is problematic (might be less specific):
        // const gradeDiv = document.querySelector('div[id$="_year_overiew_div"]');

        if (gradeDiv) {
            clearInterval(interval);
            const gradeDivId = gradeDiv.id;
            // Extract the year prefix (e.g., "2024" or "2023_2024")
            const yearPrefix = gradeDivId.substring(0, gradeDivId.indexOf('_')); 
            
            if (!yearPrefix) {
                console.error("SPOT Grade Calculator: Could not determine year prefix from gradeDiv ID:", gradeDivId);
                // Optionally, you could try to alert the user or log this more visibly
                return; // Stop if year prefix cannot be determined
            }
            
            console.log("SPOT Grade Calculator: Detected year prefix:", yearPrefix);
            calculateAndDisplayPerCourseRequirements(gradeDiv, yearPrefix); // Pass the detected yearPrefix
        }
    }, 500);
}

// Modified to accept and use the yearPrefix
function calculateAndDisplayPerCourseRequirements(gradeDiv, yearPrefix) {
    const headerRow = gradeDiv.querySelector('thead tr');
    const newHeaderId = 'unit-target-info-header';

    if (headerRow && !document.getElementById(newHeaderId)) {
        const newHeaderCell = document.createElement('th');
        newHeaderCell.id = newHeaderId;
        newHeaderCell.innerText = "Unit Target Info";
        newHeaderCell.style.textAlign = "center";
        headerRow.appendChild(newHeaderCell);
    }

    const rows = gradeDiv.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length < 6) return;

        const courseIdText = tds[0]?.innerText.trim().replace(/\s+/g, '');
        // Use the dynamic yearPrefix to construct the detailDivId
        const detailDivId = `${yearPrefix}_${courseIdText}_course_overiew_div`;
        const courseDetailDiv = document.getElementById(detailDivId);

        let messageForMainTable = "";

        if (courseDetailDiv) {
            // processCourseDetail does not directly need yearPrefix as it works within courseDetailDiv
            messageForMainTable = processCourseDetail(courseDetailDiv, tds);
        } else {
            messageForMainTable = calculateSimpleExamRequirement(tds, null, null, true);
        }
        
        const newDataCellClass = 'unit-target-info-data';
        let resultCell = row.querySelector('.' + newDataCellClass);
        if (!resultCell) {
            resultCell = row.insertCell(-1);
            resultCell.classList.add(newDataCellClass);
        }
        resultCell.innerText = messageForMainTable;
        resultCell.style.textAlign = "left";
        resultCell.style.fontSize = "0.9em";
    });
}

// processCourseDetail function remains the same as your last version
// It does not need modification for the year prefix, as it operates
// on the already found courseDetailDiv and mainTableRowTds.
function processCourseDetail(courseDetailDiv, mainTableRowTds) {
    let achievedWeightedScoreInCW = 0; 
    let totalMarkedCWItemInternalWeight = 0;
    let totalUnmarkedCWItemInternalWeight = 0;

    let unitCwWeight = 0, unitExamWeight = 0;
    const detailHtml = courseDetailDiv.innerHTML; 
    const unitWeightsMatch = detailHtml.match(/Coursework:\s*(\d+)%.*?Exam:\s*(\d+)%/i);

    if (unitWeightsMatch) {
        unitCwWeight = parseFloat(unitWeightsMatch[1]) / 100;
        unitExamWeight = parseFloat(unitWeightsMatch[2]) / 100;
    } else { 
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
    for (let i = 0; i < cwItemRows.length; i++) {
        const itemRow = cwItemRows[i];
        if (itemRow.querySelector('th')) continue;
        
        const cells = itemRow.querySelectorAll('td');
        if (cells.length < 5) continue;

        const weightText = cells[1]?.innerText.trim();
        const gradeText = cells[4]?.innerText.trim();
        
        const itemInternalWeight = parseFloat(weightText) / 100;

        if (isNaN(itemInternalWeight) || itemInternalWeight <=0 ) continue; 

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
    
    totalMarkedCWItemInternalWeight = parseFloat(totalMarkedCWItemInternalWeight.toFixed(4));
    totalUnmarkedCWItemInternalWeight = parseFloat(totalUnmarkedCWItemInternalWeight.toFixed(4));

    let detailMessageToInject = ""; 
    let messageForMainTable = "";  

    const currentOverallCwFromMainTable = parseFloat(mainTableRowTds[3]?.innerText.trim()); 

    if (totalUnmarkedCWItemInternalWeight > 0) {
        const mainTableExamPercentText = mainTableRowTds[4]?.innerText.trim();
        const mainTableExamPercent = parseFloat(mainTableExamPercentText);
        
        const assumedExamTargetForCalc = (mainTableExamPercentText !== "0" && !isNaN(mainTableExamPercent) && mainTableExamPercent > 0) 
                                         ? mainTableExamPercent 
                                         : 40; 

        let neededOverallCwPercentForUnit = 0;
        if (unitCwWeight > 0) {
            neededOverallCwPercentForUnit = (40 - (assumedExamTargetForCalc * unitExamWeight)) / unitCwWeight;
        } else { 
             detailMessageToInject = (unitExamWeight > 0) ? "This unit is weighted 0% on Coursework." : "Error: Unit CW weight is 0%.";
        }

        if (unitCwWeight > 0) { 
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
        
        let resultsP = courseDetailDiv.querySelector('.cw-grade-calculator-result-detail');
        if (!resultsP) {
            resultsP = document.createElement('p');
            resultsP.className = 'cw-grade-calculator-result-detail';
            resultsP.style.fontWeight = 'bold';
            resultsP.style.marginTop = '10px';
            resultsP.style.color = '#0056b3'; 
            const hrElement = Array.from(courseDetailDiv.querySelectorAll('hr')).pop(); 
            if (hrElement) {
                hrElement.parentNode.insertBefore(resultsP, hrElement.nextSibling); 
            } else {
                 const unitMarkP = Array.from(courseDetailDiv.querySelectorAll('p')).find(p => p.innerText.includes("Unit Mark:"));
                 if(unitMarkP) courseDetailDiv.insertBefore(resultsP, unitMarkP);
                 else courseDetailDiv.appendChild(resultsP);
            }
        }
        resultsP.innerHTML = detailMessageToInject; 

        messageForMainTable = calculateSimpleExamRequirement(mainTableRowTds, unitCwWeight, unitExamWeight, false);
        if (messageForMainTable.includes("Need") || messageForMainTable.includes("Below 40%")) {
             messageForMainTable += " (See details for CW targets)";
        } else if (messageForMainTable.includes("sufficient") || messageForMainTable.includes("achieved")) {
             messageForMainTable += " (Details in course view)";
        }
    } else { 
        messageForMainTable = calculateSimpleExamRequirement(mainTableRowTds, unitCwWeight, unitExamWeight, false);
         if (totalMarkedCWItemInternalWeight > 0 && Math.abs(totalMarkedCWItemInternalWeight - 1.0) > 0.01 && Math.abs(totalMarkedCWItemInternalWeight - 0) > 0.01) { 
            messageForMainTable += ` (Note: Parsed CW item weights sum to ${ (totalMarkedCWItemInternalWeight*100).toFixed(0) }%, not 100%.)`;
        }
    }
    return messageForMainTable;
}

// calculateSimpleExamRequirement function remains the same as your last version
function calculateSimpleExamRequirement(mainTableRowTds, unitCwW, unitExW, isFallback) {
    const examMarkText = mainTableRowTds[4]?.innerText.trim();
    const courseworkMarkText = mainTableRowTds[3]?.innerText.trim(); 
    
    let CwExamRatioText, cwWeight, examWeight;

    if (unitCwW !== null && unitExW !== null && !isNaN(unitCwW) && !isNaN(unitExW)) {
        cwWeight = unitCwW;
        examWeight = unitExW;
    } else { 
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

    if (examMarkText === "0") { 
        const courseworkMark = parseFloat(courseworkMarkText); 
        if (!isNaN(courseworkMark)) {
            if (examWeight > 0) { 
                const currentCwContributionToUnit = courseworkMark * cwWeight;
                const requiredExamContributionToUnit = 40 - currentCwContributionToUnit;

                if (requiredExamContributionToUnit <= 0) { 
                    message = `CW (${courseworkMark}%) sufficient for 40% unit.`;
                } else {
                    const neededExamPercent = requiredExamContributionToUnit / examWeight;
                    if (neededExamPercent > 100) message = `Need >100% (${neededExamPercent.toFixed(2)}%) on exam.`;
                    else if (neededExamPercent < 0) message = `CW (${courseworkMark}%) sufficient for 40% unit.`; 
                    else message = `Need ${neededExamPercent.toFixed(2)}% on exam.`;
                }
            } else { 
                if (courseworkMark >= 40) message = `40%+ achieved (100% CW at ${courseworkMark}%).`;
                else message = `Below 40% (is ${courseworkMark.toFixed(2)}%, 100% CW).`;
            }
        } else message = isFallback ? "CW% err" : "Error: Invalid Overall CW%.";
    } else { 
        const credits = parseFloat(mainTableRowTds[1]?.innerText.trim());
        const examMark = parseFloat(examMarkText);
        if (credits === 0 && parseFloat(mainTableRowTds[5]?.innerText.trim()) === 0) message = "0 credit unit.";
        else if (!isNaN(examMark) && examMark > 0) message = "Exam taken.";
        else message = isFallback ? "Exam status?" : "Exam status unclear or N/A.";
    }
    return message;
}

waitForGradesAndCalculate();