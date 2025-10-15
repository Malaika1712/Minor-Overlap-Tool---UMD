async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function cleanCourseCode(course) {
  if (typeof course === 'string') {
    return course.toUpperCase().replace(/\s+/g, '');
  } else if (course && typeof course === 'object' && course.course) {
    return course.course.toUpperCase().replace(/\s+/g, '');
  }
  return '';
}

function extractAllCourses(data) {
  const courses = new Set();

  function extract(value) {
    if (typeof value === 'string') {
      const cleaned = value.toUpperCase().replace(/\s+/g, '');
      if (/^[A-Z]{3,4}\d{3}$/.test(cleaned) || ["STAT4XX", "MATH/STATXXX"].includes(cleaned)) {
        courses.add(cleaned);
      }
    } else if (Array.isArray(value)) {
      value.forEach(extract);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(extract);
    }
  }

  // Handle both "courses" and "options" arrays
  if (data.requirements) {
    data.requirements.forEach(req => {
      const courseList = req.options || req.courses || [];
      if (Array.isArray(courseList)) {
        courseList.forEach(item => {
          if (Array.isArray(item)) {
            // Handle nested arrays like [["STAT400", "STAT401"]]
            item.forEach(c => extract(c));
          } else {
            extract(item);
          }
        });
      }
    });
  } else {
    Object.values(data).forEach(extract);
  }

  return Array.from(courses);
}

const linearAlgebraTracks = new Set([
  "data_science_track.json",
  "ml_track.json",
  "quantum_track.json"
]);

const generalTrackElectives = [
  "CMSC320", "CMSC335", "CMSC388", "CMSC389", "CMSC395", "CMSC396", "CMSC401",
  "CMSC425", "CMSC473", "CMSC475", "CMSC476", "CMSC477", "CMSC488A",
  "CMSC498", "CMSC498A", "CMSC499A"
];

// Minor color mapping to match CSS
const minorColors = {
  'Math': '#108f2f',
  'Statistics': '#da2cfc',
  'Business Analytics': '#0eb0f0',
  'Robotics': '#726f74',
  'QSE': '#1d1abc',
  'Computational Finance': '#ff9502',
  'Actuarial Math': '#5c067eff',
  'Data Science': 'rgb(165, 15, 123)'
};

function getMinorColor(minorName) {
  return minorColors[minorName] || '#34495e';
}

async function checkOverlap() {
  try {
    const areasData = await loadJSON('./shared/areas.json');
    const coreData = await loadJSON('./shared/Cores.json');
    const trackFile = document.getElementById('track').value;
    const trackData = await loadJSON(`./tracks/${trackFile}`);

    const trackMandatoryCourses = new Set();
    if (trackData.requirements) {
      trackData.requirements.forEach(req => {
        if (
          req.category &&
          req.category.toUpperCase() === 'MANDATORY'
        ) {
          const courseList = req.options || req.courses || [];
          if (Array.isArray(courseList)) {
            courseList.forEach(c => trackMandatoryCourses.add(cleanCourseCode(c)));
          }
        }
      });
    }

    const trackCourses = extractAllCourses(trackData).map(cleanCourseCode);
    const coreCourses = extractAllCourses(coreData).map(cleanCourseCode);

    const minorFiles = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    const minorDataList = await Promise.all(minorFiles.map(f => loadJSON(`./minors/${f}`)));

    // Check for invalid combinations
    const selectedMinors = minorFiles.map(f => f.replace('.json', ''));
    const isQuantumTrack = trackFile === "quantum_track.json";
    const hasQSEMinor = selectedMinors.includes('QSE');

    if (isQuantumTrack && hasQSEMinor) {
      const warningHTML = `
        <div style="background:#ffe6e6;color:#e21833;padding:20px;border-radius:8px;font-weight:bold;margin:20px 0;border-left:6px solid #e21833;text-align:center;">
          <span style="font-size:2em;">⚠️</span><br>
          <span style="font-size:1.5em;color:#e21833;">Not Possible</span><br>
          <span style="font-size:1.1em;color:#000;margin-top:10px;display:block;">
            Quantum Computing Track and QSE Minor cannot be selected together.<br>
            Please watch your selections and choose a different combination.
          </span>
        </div>
      `;
      
      document.getElementById('results').innerHTML = warningHTML;
      document.getElementById('results').style.display = 'block';
      document.getElementById('results-area').style.display = 'block';
      document.getElementById('error').textContent = '';
      return; // Exit the function early
    }

    const areaCourseMap = {};
    areasData.areas.forEach(area => {
      area.courses.forEach(course => {
        areaCourseMap[cleanCourseCode(typeof course === 'string' ? course : course.course)] = { areaNum: area.area, areaName: area.name };
      });
    });

    const results = [];

    minorDataList.forEach((minor, index) => {
      const minorName = minorFiles[index].replace('.json', '');
      const minorCourses = new Set();
      
      if (minor.requirements) {
        minor.requirements.forEach(req => {
          const courseList = req.options || req.courses || [];
          if (Array.isArray(courseList)) {
            courseList.forEach(item => {
              if (Array.isArray(item)) {
                // Handle nested arrays like [["STAT400", "STAT401"]]
                item.forEach(c => minorCourses.add(cleanCourseCode(c)));
              } else {
                // Handle regular strings
                minorCourses.add(cleanCourseCode(item));
              }
            });
          }
        });
      }

      const trackOverlaps = [];
      const coreOverlaps = [];
      const areaOverlaps = [];
      const electiveOverlaps = [];

      minorCourses.forEach(minorCourse => {
        const cleanedCourse = cleanCourseCode(minorCourse);
        const isStat4XX = /^STAT4\d{2}$/.test(cleanedCourse);
        const isMathStat = /^(MATH|STAT)[234]\d{2}$/.test(cleanedCourse);

        // Handle STAT4XX requirement
        if (coreCourses.includes("STAT4XX") && isStat4XX) {
          coreOverlaps.push({ 
            course: cleanedCourse, 
            original: minorCourse, 
            source: 'Core', 
            coreType: "STAT4XX",
            satisfiesStatRequirement: true 
          });
          return;
        }

        // Handle MATH/STAT requirement with validation  
        if (coreCourses.includes("MATH/STATXXX") && isMathStat) {
          coreOverlaps.push({ 
            course: cleanedCourse, 
            original: minorCourse, 
            source: 'Core', 
            coreType: "MATH/STAT",
            satisfiesStatRequirement: /^STAT/.test(cleanedCourse)
          });
          return;
        }
        if (coreCourses.includes(cleanedCourse)) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: null });
          return;
        }
        if (trackCourses.includes(cleanedCourse)) {
          const areaInfo = areaCourseMap[cleanedCourse];
          const isTrackMandatory = trackMandatoryCourses.has(cleanedCourse);
          
          // Find which track requirement this course satisfies
          let trackCategory = 'Track Requirement';
          if (trackData.requirements) {
            trackData.requirements.forEach(req => {
              const courseList = req.options || req.courses || [];
              if (courseList && courseList.map(cleanCourseCode).includes(cleanedCourse)) {
                trackCategory = req.category || req.name || 'Track Requirement';
              }
            });
          }
          
          trackOverlaps.push({ 
            course: cleanedCourse, 
            original: minorCourse, 
            source: 'Track', 
            area: areaInfo, 
            trackMandatory: isTrackMandatory,
            trackCategory: trackCategory
          });
          return;
        }
        const areaInfo = areaCourseMap[cleanedCourse];
        if (areaInfo) {
          areaOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Area', area: areaInfo });
        }
        if (trackFile === "general_track.json" && generalTrackElectives.includes(cleanedCourse)) {
          electiveOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Elective' });
        }
      });

      results.push({
        minor: minorName,
        trackOverlaps,
        areaOverlaps,
        coreOverlaps,
        electiveOverlaps,
        requirements: minor.requirements || []
      });
    });

    // Build overlap map - consolidate by course first
    const overlapMap = {};
    results.forEach(result => {
      const minorColor = getMinorColor(result.minor);
      const all = [
        ...result.coreOverlaps.map(o => ({ ...o, majorCategory: "Core", minor: result.minor, minorColor })),
        ...result.trackOverlaps.map(o => ({ ...o, majorCategory: "Track", minor: result.minor, minorColor, trackCategory: o.trackCategory })),
        ...result.areaOverlaps.map(o => ({ ...o, majorCategory: "Area", minor: result.minor, minorColor, area: o.area })),
        ...result.electiveOverlaps.map(o => ({ ...o, majorCategory: "General Elective", minor: result.minor, minorColor }))
      ];

      all.forEach(overlap => {
        const course = overlap.course;
        if (!overlapMap[course]) {
          overlapMap[course] = [];
        }

        // Set minor category
        let minorCat = 'Elective';
        let isMandatory = false;
        if (result.requirements) {
          result.requirements.forEach(req => {
            const courseList = req.options || req.courses || [];
            if (courseList) {
              // Handle both regular courses and nested arrays
              const allCourses = [];
              courseList.forEach(item => {
                if (Array.isArray(item)) {
                  allCourses.push(...item.map(cleanCourseCode));
                } else {
                  allCourses.push(cleanCourseCode(item));
                }
              });
              
              if (allCourses.includes(cleanCourseCode(typeof course === 'string' ? course : course.course))) {
                minorCat = req.category || req.name || 'Elective';
                if (req.type === 'all' || req.type === 'required' || req.category === 'MANDATORY') isMandatory = true;
              }
            }
          });
        }

        overlapMap[course].push({
          minor: overlap.minor,
          minorColor: overlap.minorColor,
          minorCat: isMandatory ? 'MANDATORY' : minorCat,
          majorCategory: overlap.majorCategory,
          area: overlap.area,
          trackCategory: overlap.trackCategory
        });
      });
    });

    // Consolidate all overlaps by course and build summary
    const courseSummaries = new Map();

    Object.entries(overlapMap).forEach(([course, overlaps]) => {
      const inMajor = trackCourses.includes(course) || coreCourses.includes(course) ||
        (trackFile === "general_track.json" && /^(MATH|STAT)[34]\d{2}$/.test(course));
      const inMinor = overlaps.length > 0;

      if (inMajor && inMinor) {
        let minorRequirements = [];
        let majorRequirements = [];

        overlaps.forEach(o => {
          const cat = o.minorCat ? o.minorCat.toUpperCase() : '';
          let minorColor = o.minorColor || '#e74c3c';
          
          // Minor requirements
          if (cat === 'MANDATORY' || cat === 'CORE') {
            minorRequirements.push(`<span style="background:${minorColor};color:#fff;padding:2px 8px;border-radius:6px;font-weight:bold;">MANDATORY (${o.minor} minor)</span>`);
          } else if (["LINEAR ALGEBRA", "PROBABILITY", "THEORETICAL", "ANALYSIS", "ALGEBRA", "MATH", "STATISTICS"].includes(cat)) {
            minorRequirements.push(`<span style="background:${minorColor};color:#fff;padding:2px 8px;border-radius:6px;">Satisfies ${o.minorCat} requirement (${o.minor} minor)</span>`);
          } else if (cat === 'TECHNICAL ELECTIVE') {
            minorRequirements.push(`<span style="background:${minorColor};color:#fff;padding:2px 8px;border-radius:6px;">Satisfies Technical Elective (${o.minor} minor)</span>`);
          } else if (cat === 'ELECTIVE') {
            minorRequirements.push(`<span style="background:${minorColor};color:#fff;padding:2px 8px;border-radius:6px;">Satisfies Elective (${o.minor} minor)</span>`);
          } else {
            minorRequirements.push(`<span style="background:${minorColor};color:#fff;padding:2px 8px;border-radius:6px;">Satisfies ${o.minorCat} (${o.minor} minor)</span>`);
          }

          // Major requirements (collect once per unique requirement)
          if (o.majorCategory === "General Elective" && !majorRequirements.some(req => req.includes("General Elective"))) {
            majorRequirements.push(`<span style="background:#e21833;color:#fff;padding:2px 8px;border-radius:6px;">Satisfies General Elective (CS major)</span>`);
          }

          if (o.majorCategory === "Track" && o.trackCategory && !majorRequirements.some(req => req.includes(o.trackCategory))) {
            if (o.trackCategory.toUpperCase() === 'MANDATORY') {
              majorRequirements.push(`<span style="background:#e21833;color:#fff;padding:2px 8px;border-radius:6px;font-weight:bold;">MANDATORY (CS major)</span>`);
            } else {
              majorRequirements.push(`<span style="background:#e21833;color:#fff;padding:2px 8px;border-radius:6px;">Satisfies ${o.trackCategory} (CS major)</span>`);
            }
          }

          if (o.majorCategory === "Area" && o.area && !majorRequirements.some(req => req.includes(`Area ${o.area.areaNum}`))) {
            majorRequirements.push(`<span style="background:#B9770E;color:#fff;padding:2px 8px;border-radius:6px;">Satisfies Area ${o.area.areaNum} (${o.area.areaName}) (CS major)</span>`);
          }
        });

        // Check MATH/STAT requirement once per course
        if (
          (/^(MATH|STAT)[234]\d{2}$/.test(course) || course === "STAT4XX" || course === "MATH/STATXXX") &&
          !majorRequirements.some(req => req.includes("MATH and STAT"))
        ) {
          majorRequirements.push(`<span style="background:#e21833;color:#fff;font-weight:bold;padding:2px 8px;border-radius:6px;">Satisfies MATH and STAT (CS major)</span>`);
        }

        // Remove duplicates and combine all requirements
        const uniqueMinorReqs = [...new Set(minorRequirements)];
        const uniqueMajorReqs = [...new Set(majorRequirements)];
        const allRequirements = [...uniqueMinorReqs, ...uniqueMajorReqs];

        // Format with commas and "and" before the last item
        let formattedSummary = '';
        if (allRequirements.length === 1) {
          formattedSummary = allRequirements[0];
        } else if (allRequirements.length === 2) {
          formattedSummary = allRequirements.join(' and ');
        } else {
          const lastRequirement = allRequirements.pop();
          formattedSummary = allRequirements.join(', ') + ' and ' + lastRequirement;
        }

        courseSummaries.set(course, formattedSummary);
      }
    });

    // Group courses by identical summaries for the table
    const summaryMap = new Map();
    courseSummaries.forEach((summary, course) => {
      if (summaryMap.has(summary)) {
        summaryMap.get(summary).push(course);
      } else {
        summaryMap.set(summary, [course]);
      }
    });

    // Convert to array for table rendering
    const summaryRows = Array.from(summaryMap.entries()).map(([summary, courses]) => ({
      courses: courses,
      summary: summary
    }));

    // Count total overlapping rows (not individual courses)
    const totalOverlapCourses = summaryRows.length;

    // Render summary table
    let trackName = document.getElementById('track').options[document.getElementById('track').selectedIndex].text;
    let minorLabels = Array.from(document.querySelectorAll('input[name="minors"]:checked')).map(cb => {
      const label = document.querySelector(`label[for="${cb.id}"]`);
      return label ? label.textContent : cb.value.replace('.json', '');
    });
    const selectionSummary = `
      <div style="margin-bottom:18px;font-size:1.1em;">
        <strong>Selected Track:</strong> ${trackName}<br>
        <strong>Selected Minor(s):</strong> ${minorLabels.length ? minorLabels.join(', ') : 'None'}
      </div>
    `;

    let resultHTML = selectionSummary;
    resultHTML += '<h3>📊 Overlap Analysis Results</h3>';


    resultHTML += `<div style="margin-bottom:18px;font-size:1.1em;">
      <strong>Overlapping courses:</strong> ${totalOverlapCourses} <span style="color:#27ae60;font-size:1.2em;">✅</span> (<strong>Only 2 are allowed</strong>)
    </div>`;
    resultHTML += '<table style="width: 100%; margin: 10px 0; border-collapse: collapse; font-size: 14px;">';
    resultHTML += '<thead><tr style="background: #f8f9fa;">' +
      '<th style="padding: 8px; border: 1px solid #ddd; width: 35%;">Courses</th>' +
      '<th style="padding: 8px; border: 1px solid #ddd; width: 65%;">Overlap summary</th>' +
      '</tr></thead><tbody>';

    summaryRows.forEach((row, i) => {
      resultHTML += `
        <tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9f9'};">
          <td style="padding:12px;border:1px solid #ddd;">${row.courses.join(', ')}</td>
          <td style="padding:12px;border:1px solid #ddd;">${row.summary}</td>
        </tr>
      `;
    });

    resultHTML += '</tbody></table>';

    document.getElementById('results').innerHTML = resultHTML;
    document.getElementById('results').style.display = 'block';
    document.getElementById('results-area').style.display = 'block';
    document.getElementById('error').textContent = '';

    // Check for overlaps between selected minors
    const selectedMinorsCheck = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value.replace('.json', ''));
    const minorCourseSets = results.map(result => new Set(
      result.coreOverlaps.map(o => o.course)
        .concat(result.trackOverlaps.map(o => o.course))
        .concat(result.areaOverlaps.map(o => o.course))
        .concat(result.electiveOverlaps.map(o => o.course))
    ));
    let overlapBetweenMinors = false;
    let overlappingPairs = [];

    if (minorCourseSets.length > 1) {
      for (let i = 0; i < minorCourseSets.length; i++) {
        for (let j = i + 1; j < minorCourseSets.length; j++) {
          const intersection = [...minorCourseSets[i]].filter(x => minorCourseSets[j].has(x));
          if (intersection.length > 0) {
            overlapBetweenMinors = true;
            overlappingPairs.push({
              minors: [selectedMinorsCheck[i], selectedMinorsCheck[j]],
              courses: intersection
            });
          }
        }
      }
    }

    if (overlapBetweenMinors) {
      let overlapBox = `<div style="background:#fffbe6;color:#e21833;padding:16px 20px;border-radius:8px;font-weight:bold;margin-top:20px;border-left:6px solid #e21833;">
        <span style="font-size:1.3em;">❌</span> <span style="color:#e21833;">Not allowed:</span> The following courses overlap between selected minors:<br>`;
      overlappingPairs.forEach(pair => {
        overlapBox += `<div style="margin-top:8px;">
          <span style="color:#008080;">${pair.courses.join(', ')}</span>
          <span style="color:#000;"><strong>between ${pair.minors[0]}</strong> and <strong>${pair.minors[1]}</strong></span>
        </div>`;
      });
      overlapBox += `<div style="margin-top:10px;color:#e21833;">Please adjust your selection. Overlapping courses between minors are not allowed.</div></div>`;

      document.getElementById('results').innerHTML += overlapBox;
    }
  } catch (err) {
    document.getElementById('results').style.display = 'none';
    document.getElementById('error').textContent = `❌ Error: ${err.message}`;
    console.error(err);
  }
}

function validateStatRequirements(overlaps) {
  let hasStat4XX = false;
  let mathCourseCount = 0;
  let statCourseCount = 0;
  let stat4XXCourses = [];
  
  overlaps.forEach(course => {
    // Check for STAT4XX courses
    if (/^STAT4\d{2}$/.test(course)) {
      hasStat4XX = true;
      stat4XXCourses.push(course);
      statCourseCount++;
    }
    
    // Count other STAT courses
    if (/^STAT[123]\d{2}$/.test(course)) {
      statCourseCount++;
    }
    
    // Count MATH courses used for requirements
    if (/^MATH\d{3}$/.test(course)) {
      mathCourseCount++;
    }
  });
  
  // Must have at least 1 STAT4XX
  if (!hasStat4XX) {
    return {
      valid: false,
      message: "All tracks require at least 1 STAT4XX course"
    };
  }
  
  // Check if using too many MATH courses without enough STAT
  if (mathCourseCount >= 2 && statCourseCount < 2) {
    return {
      valid: false, 
      message: "Cannot use multiple MATH courses for lower level requirements without having at least 2 STAT courses (including 1 STAT4XX)"
    };
  }
  
  return { valid: true };
}

function validateCoreRequirements(overlaps) {
  let hasStat4XX = false;
  let mathRequirementCourses = [];
  let statRequirementCourses = [];
  
  overlaps.forEach(course => {
    // Check for STAT4XX courses
    if (/^STAT4\d{2}$/.test(course)) {
      hasStat4XX = true;
      statRequirementCourses.push(course);
    }
    
    // Count other STAT courses that can fulfill requirements
    if (/^STAT[123]\d{2}$/.test(course)) {
      statRequirementCourses.push(course);
    }
    
    // Count MATH courses that fulfill core requirements
    if (/^MATH(140|141|240|241|246|310|340|341|461)$/.test(course)) {
      mathRequirementCourses.push(course);
    }
  });
  
  const warnings = [];
  
  // Must have at least 1 STAT4XX
  if (!hasStat4XX) {
    warnings.push("All tracks require at least 1 STAT4XX course");
  }
  
  // Check if using multiple MATH courses without enough STAT courses
  // Students need at least 2 STAT courses (including 1 STAT4XX) if using multiple MATH courses
  if (mathRequirementCourses.length >= 2 && statRequirementCourses.length < 2) {
    warnings.push("Cannot use multiple MATH courses for lower level requirements without having at least 2 STAT courses (including 1 STAT4XX)");
  }
  
  // Special case: if only using MATH courses and no STAT4XX
  if (mathRequirementCourses.length >= 1 && !hasStat4XX) {
    warnings.push("Must have at least 1 STAT4XX course even when using MATH courses for other requirements");
  }
  
  return {
    valid: warnings.length === 0,
    warnings: warnings
  };
}

document.getElementById('overlapForm').addEventListener('submit', function(e) {
  e.preventDefault();

  const trackFile = document.getElementById('track').value;
  const minorFiles = Array.from(document.querySelectorAll('input[name="minors"]:checked')).map(cb => cb.value);

  // Block analysis ONLY for ML/Data Science track + Data Science minor
  if (
    (trackFile === "ml_track.json" || trackFile === "data_science_track.json") &&
    minorFiles.includes("Data Science.json")
  ) {
    // Show popup box with Testudo image
    const popup = document.createElement('div');
    popup.innerHTML = `
      <div style="
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background: #fff3cd;
        color: #856404;
        padding: 32px 36px;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        border-left: 8px solid #ffc107;
        z-index: 9999;
        font-size: 1.25em;
        text-align: center;
      ">
        <img src="testudo-MalaikaAsif.jpg" alt="Testudo" style="height:100px;margin-bottom:10px;">
        <br>
        <strong style="margin-left:10px;">Watch Out!</strong>
        <div style="margin-top:18px;">
          Students on the <strong>Data Science</strong> or <strong>Machine Learning</strong> tracks are <strong>not eligible</strong> for the Data Science minor. Please select a different minor.
        </div>
        <button id="closePopup" style="
          margin-top:24px;
          background:#e21833;
          color:#fff;
          border:none;
          border-radius:8px;
          padding:10px 28px;
          font-size:1em;
          cursor:pointer;
        ">OK</button>
      </div>
    `;
    popup.id = "ds-warning-popup";
    document.body.appendChild(popup);

    document.getElementById('closePopup').onclick = function() {
      document.body.removeChild(popup);
    };

    return;
  }

  // Run your actual overlap analysis and display the table
  checkOverlap();

  // Show ULC warning if Data Science minor is selected (but DO NOT block table)
  if (minorFiles.includes("Data Science.json")) {
    const warningDiv = document.createElement('div');
    warningDiv.innerHTML = `
      <div style="
        background:#fff3cd;
        color:#856404;
        padding:16px;
        border-radius:8px;
        margin:20px 0 0 0;
        border-left:6px solid #ffc107;
        font-size:1.1em;
        display:flex;
        align-items:center;
      ">
        <img src="testudo-MalaikaAsif.jpg" alt="Testudo" style="height:38px;margin-right:14px;">
        <span>
          <strong>Note:</strong> Data Science minor cannot be used for Upper Level Concentration (ULC).
        </span>
      </div>
    `;
    const results = document.getElementById('results');
    results.insertBefore(warningDiv, results.firstChild);
  }
});

document.getElementById('resetBtn').addEventListener('click', function() {
  // Uncheck all minors
  document.querySelectorAll('input[name="minors"]:checked').forEach(cb => cb.checked = false);
  // Reset track selection
  document.getElementById('track').selectedIndex = 0;
  // Clear results and error messages
  document.getElementById('results').innerHTML = '';
  document.getElementById('results').style.display = 'none';
  document.getElementById('error').textContent = '';
  document.getElementById('results-area').style.display = 'none';
});



