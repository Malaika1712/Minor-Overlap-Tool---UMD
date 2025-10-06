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
  'Math': '#108f2f',           // Green (matches HTML)
  'Statistics': '#da2cfc',     // Purple (matches HTML) 
  'Business Analytics': '#0eb0f0',  // Blue (matches HTML)
  'Robotics': '#726f74',       // Gray (matches HTML)
  'QSE': '#1d1abc',           // Blue (matches HTML)
  'Computational Finance': '#ff9502'  // Orange (matches HTML)
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
          req.category.toUpperCase() === 'MANDATORY' &&
          Array.isArray(req.options)
        ) {
          req.options.forEach(c => trackMandatoryCourses.add(cleanCourseCode(c)));
        }
      });
    }

    const trackCourses = extractAllCourses(trackData).map(cleanCourseCode);
    const coreCourses = extractAllCourses(coreData).map(cleanCourseCode);

    const minorFiles = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    const minorDataList = await Promise.all(minorFiles.map(f => loadJSON(`./minors/${f}`)));

    const areaCourseMap = {};
    areasData.areas.forEach(area => {
      area.courses.forEach(course => {
        areaCourseMap[cleanCourseCode(typeof course === 'string' ? course : course.course)] = { areaNum: area.area, areaName: area.name };
      });
    });

    const majorCourses = new Set([...trackCourses, ...coreCourses]);
    const results = [];

    minorDataList.forEach((minor, index) => {
      const minorName = minorFiles[index].replace('.json', '');
      const minorCourses = new Set();
      // Collect all minor courses from requirements
      if (minor.requirements) {
        minor.requirements.forEach(req => {
          if (Array.isArray(req.options)) {
            req.options.forEach(c => minorCourses.add(cleanCourseCode(c)));
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
        const isMathStat3xx4xx = /^(MATH|STAT)[34]\d{2}$/.test(cleanedCourse);

        if (trackFile === "general_track.json" && isMathStat3xx4xx) {
          // For general track, treat all MATH/STAT 3XX/4XX as core
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: "MATH/STATXXX" });
          return;
        }
        if (coreCourses.includes("STAT4XX") && isStat4XX) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: "STAT4XX" });
          return;
        }
        if (coreCourses.includes("MATH/STATXXX") && isMathStat3xx4xx) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: "MATH/STATXXX" });
          return;
        }
        if (coreCourses.includes(cleanedCourse)) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: null });
          return;
        }
        if (trackCourses.includes(cleanedCourse)) {
          const areaInfo = areaCourseMap[cleanedCourse];
          const isTrackMandatory = trackMandatoryCourses.has(cleanedCourse);
          trackOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Track', area: areaInfo, trackMandatory: isTrackMandatory });
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

    // Gather all overlaps for all minors
    const overlapMap = {};
    results.forEach(result => {
      const minorColor = getMinorColor(result.minor);
      const all = [
        ...result.coreOverlaps.map(o => ({ ...o, majorCategory: "Core", minor: result.minor, minorColor })),
        ...result.trackOverlaps.map(o => ({ ...o, majorCategory: "Track", minor: result.minor, minorColor })),
        ...result.areaOverlaps.map(o => ({ ...o, majorCategory: "Area", minor: result.minor, minorColor, area: o.area })),
        ...result.electiveOverlaps.map(o => ({ ...o, majorCategory: "General Elective", minor: result.minor, minorColor }))
      ];

      all.forEach(overlap => {
        const course = overlap.course;
        if (!overlapMap[course]) overlapMap[course] = [];
        // Find minor requirement/category
        let minorCat = 'Elective';
        let isMandatory = false;
        if (result.requirements) {
          result.requirements.forEach(req => {
            if (req.options && req.options.map(cleanCourseCode).includes(cleanCourseCode(typeof course === 'string' ? course : course.course))) {
              minorCat = req.category || req.name || 'Elective';
              if (req.type === 'all' || req.type === 'required' || req.category === 'MANDATORY') isMandatory = true;
            }
          });
        }
        overlapMap[course].push({
          minor: overlap.minor,
          minorColor: overlap.minorColor,
          minorCat: isMandatory ? 'MANDATORY' : minorCat,
          majorCategory: overlap.majorCategory,
          area: overlap.area
        });
      });
    });

    const isGeneralTrack = document.getElementById('track').value === "general_track.json";
    const summaryRows = [];

    // Only show overlaps: course must be required by both major and minor
    Object.entries(overlapMap).forEach(([course, overlaps]) => {
      // Check if course is in major requirements (trackCourses or coreCourses)
      const inMajor = trackCourses.includes(course) || coreCourses.includes(course) ||
        (trackFile === "general_track.json" && /^(MATH|STAT)[34]\d{2}$/.test(course));
      // Check if course is in minor requirements (overlaps array is not empty)
      const inMinor = overlaps.length > 0;

      if (inMajor && inMinor) {
        overlaps.forEach(o => {
          const cat = o.minorCat ? o.minorCat.toUpperCase() : '';
          let minorLabel = '';
          let minorColor = o.minorColor || '#e74c3c';

          if (cat === 'MANDATORY') {
            minorLabel = `<span style="background:${minorColor};color:#fff;padding:2px 8px;border-radius:6px;font-weight:bold;">MANDATORY</span>`;
          } else if (["LINEAR ALGEBRA", "PROBABILITY", "THEORETICAL", "ANALYSIS", "ALGEBRA"].includes(cat)) {
            minorLabel = `<span style="background:${minorColor};color:#fff;padding:2px 8px;border-radius:6px;">Satisfies ${o.minorCat} requirement</span>`;
          } else if (cat === 'TECHNICAL ELECTIVE') {
            minorLabel = `<span style="background:${minorColor};color:#fff;padding:2px 8px;border-radius:6px;">Satisfies Technical Elective</span>`;
          } else {
            minorLabel = `<span style="background:${minorColor};color:#fff;padding:2px 8px;border-radius:6px;">Satisfies minor</span>`;
          }

          // For major labels, use red
          let satisfiesLabel = '';
          if (
            /^(MATH|STAT)[34]\d{2}$/.test(course) ||
            course === "STAT4XX" ||
            course === "MATH/STATXXX"
          ) {
            satisfiesLabel = `<span style="background:#e21833;color:#fff;font-weight:bold;padding:2px 8px;border-radius:6px;">Satisfies MATH/STAT 3XX-4XX (major)</span>`;
          }

          let majorLabel = '';
          if (o.majorCategory === "General Elective") {
            majorLabel = `<span style="background:#e21833;color:#fff;padding:2px 8px;border-radius:6px;">Satisfies General Elective (major)</span>`;
          }

          // Compose the summary
          let summary = minorLabel;
          if (majorLabel) {
            summary += ` and ${majorLabel}`;
          }
          if (o.majorCategory === "Area" && o.area) {
            summary += ` and <span style="background:#B9770E;color:#fff;padding:2px 8px;border-radius:6px;">Satisfies Area ${o.area.areaNum} (${o.area.areaName})</span>`;
          }
          if (satisfiesLabel) {
            summary += ` and ${satisfiesLabel}`;
          }

          // Find if this group already exists (by summary)
          let existing = summaryRows.find(row => row.summary === summary);
          if (existing) {
            existing.courses.push(course);
          } else {
            summaryRows.push({ courses: [course], summary });
          }
        });
      }
    });

    // Count total overlapping courses
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
      <strong>Overlapping courses:</strong> ${totalOverlapCourses} <span style="color:#27ae60;font-size:1.2em;">✅</span> (only 2 are valid)
    </div>`;
    resultHTML += '<table style="width: 100%; margin: 10px 0; border-collapse: collapse; font-size: 14px;">';
    resultHTML += '<thead><tr style="background: #f8f9fa;">' +
      '<th style="padding: 8px; border: 1px solid #ddd; width: 35%;">Courses</th>' +
      '<th style="padding: 8px; border: 1px solid #ddd; width: 65%;">Overlap summary</th>' +
      '</tr></thead><tbody>';

    summaryRows.forEach((row, i) => {
      // Determine the minor color for course highlighting
      let courseHighlight = '#f9f9f9'; // default
      if (row.courses.length > 0) {
        const firstCourse = row.courses[0];
        if (overlapMap[firstCourse] && overlapMap[firstCourse].length > 0) {
          courseHighlight = overlapMap[firstCourse][0].minorColor || '#f9f9f9';
        }
      }

      // Highlight the courses with minor color, keep normal table background
      const highlightedCourses = row.courses.map(course => 
        `<span style="background:${courseHighlight};color:#fff;padding:4px 8px;border-radius:6px;font-weight:bold;">${course}</span>`
      ).join(', ');

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
    const selectedMinors = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value.replace('.json', ''));
    const minorCourseSets = results.map(result => new Set(
      result.coreOverlaps.map(o => o.course)
        .concat(result.trackOverlaps.map(o => o.course))
        .concat(result.areaOverlaps.map(o => o.course))
        .concat(result.electiveOverlaps.map(o => o.course))
    ));
    let overlapBetweenMinors = false;
    let overlappingCourses = [];
    let overlappingPairs = [];

    if (minorCourseSets.length > 1) {
      for (let i = 0; i < minorCourseSets.length; i++) {
        for (let j = i + 1; j < minorCourseSets.length; j++) {
          const intersection = [...minorCourseSets[i]].filter(x => minorCourseSets[j].has(x));
          if (intersection.length > 0) {
            overlapBetweenMinors = true;
            overlappingCourses = overlappingCourses.concat(intersection);
            overlappingPairs.push({
              minors: [selectedMinors[i], selectedMinors[j]],
              courses: intersection
            });
          }
        }
      }
    }

    if (overlapBetweenMinors) {
      // Build the overlap warning box
      let overlapBox = `<div style="background:#fffbe6;color:#e21833;padding:16px 20px;border-radius:8px;font-weight:bold;margin-top:20px;border-left:6px solid #e21833;">
  <span style="font-size:1.3em;">❌</span> <span style="color:#e21833;">Not allowed:</span> The following courses overlap between selected minors:<br>`;
      overlappingPairs.forEach(pair => {
        overlapBox += `<div style="margin-top:8px;">
    <span style="color:#ffd200;">${pair.courses.join(', ')}</span>
    <span style="color:#000;"><strong>between ${pair.minors[0]}</strong> and <strong>${pair.minors[1]}</strong></span>
  </div>`;
      });
      overlapBox += `<div style="margin-top:10px;color:#e21833;">Please adjust your selection. Overlapping courses between minors are not allowed.</div></div>`;

      // Append the warning box to the results
      document.getElementById('results').innerHTML += overlapBox;
    }
  } catch (err) {
    document.getElementById('results').style.display = 'none';
    document.getElementById('error').textContent = `❌ Error: ${err.message}`;
    console.error(err);
  }
}



// Helper functions
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

  if (Array.isArray(data.courses)) {
    extract(data.courses);
  } else {
    Object.values(data).forEach(extract);
  }

  return Array.from(courses);
}

document.getElementById('overlapForm').addEventListener('submit', function(e) {
  e.preventDefault();
  checkOverlap(); // This should be your main function that runs the analysis and updates #results
});



