<<<<<<< HEAD
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function cleanCourseCode(course) {
  return course.toUpperCase().replace(/\s+/g, '');
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

function getLinearAlgebraNote(course, trackFile) {
  if (!linearAlgebraTracks.has(trackFile)) return null;
  return course === "MATH341" ? " (must complete MATH340 first)" : "";
}

function shouldShowLinearAlgebra(course, trackFile) {
  const relevantCourses = ["MATH240", "MATH341", "MATH461"];
  return linearAlgebraTracks.has(trackFile) || !relevantCourses.includes(course);
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

  if (Array.isArray(data.courses)) {
    extract(data.courses);
  } else {
    Object.values(data).forEach(extract);
  }

  return Array.from(courses);
}

function getCoreCourseNote(course) {
  if (course === "STAT4XX") {
    return " (Must have MATH141 prerequisite; Cannot be crosslisted with CMSC)";
  }
  if (course === "MATH/STATXXX") {
    return " (Must have MATH141 prerequisite; Cannot be cross-listed with CMSC)";
  }
  return "";
}

function validateRequirements(overlaps, requirements, courseMetaMap = {}) {
  const usedCourses = new Set();
  const results = [];

  requirements.forEach(req => {
    const matched = req.options?.filter(course => overlaps.includes(course)) || [];
    let status = "❌ Unmet";

    if (req.type === "all") {
      status = matched.length === req.options.length ? "✅ Satisfied" : "⚠️ Partially Met";
    } else if (req.type === "chooseOne") {
      status = matched.length >= 1 ? "✅ Satisfied" : "❌ Unmet";
    } else if (req.type === "chooseN") {
      status = matched.length >= req.count ? "✅ Satisfied" : `⚠️ Only ${matched.length} of ${req.count}`;
    } else if (req.type === "creditMinimum") {
      const validCourses = overlaps.filter(course => {
        const prefixMatch = course.startsWith(req.filters.prefix);
        const levelMatch = parseInt(course.slice(-3)) >= req.filters.level;
        const excluded = req.filters.excluded || [];
        return prefixMatch && levelMatch && !excluded.includes(course);
      });
      const totalCredits = validCourses.reduce((sum, course) => {
        const match = course.match(/\((\d+)\)/);
        return sum + (match ? parseInt(match[1]) : 3);
      }, 0);
      status = totalCredits >= req.credits ? "✅ Satisfied" : `⚠️ Only ${totalCredits} of ${req.credits} credits`;
      matched.push(...validCourses);
    }

    matched.forEach(c => usedCourses.add(c));

    const annotated = matched.map(c => {
      const meta = courseMetaMap[c];
      return meta?.areaName ? `${c} (${meta.areaName})` : c;
    });

    results.push({
      requirement: req.name,
      category: req.category,
      matched: annotated,
      status
    });
  });

  return { results, usedCourses };
}

function validateAreaRequirements(overlaps, areaCourseMap) {
  const areaResults = [];
  const areaCounts = {};
  
  // Count courses per area
  overlaps.forEach(course => {
    const areaInfo = areaCourseMap[course];
    if (areaInfo) {
      const areaNum = areaInfo.areaNum;
      if (!areaCounts[areaNum]) {
        areaCounts[areaNum] = { count: 0, courses: [], areaName: areaInfo.areaName };
      }
      areaCounts[areaNum].count++;
      areaCounts[areaNum].courses.push(course);
    }
  });
  
  // Create area requirement results
  Object.entries(areaCounts).forEach(([areaNum, data]) => {
    if (data.count > 0) {
      areaResults.push({
        requirement: `Area ${areaNum} (${data.areaName})`,
        category: "Area",
        matched: data.courses,
        status: "✅ Satisfied"
      });
    }
  });
  
  return { results: areaResults };
}

function checkCrossMinorOverlaps(results) {
  const courseToMinorsMap = {};
  const crossMinorOverlaps = [];
  
  // Build a map of courses to the minors they appear in
  results.forEach(result => {
    const minorName = result.minor;
    const allOverlaps = [
      ...result.trackOverlaps,
      ...result.coreOverlaps,
      ...result.areaOverlaps,
      ...result.electiveOverlaps
    ];
    
    allOverlaps.forEach(overlap => {
      const course = cleanCourseCode(overlap.course);
      if (!courseToMinorsMap[course]) {
        courseToMinorsMap[course] = [];
      }
      if (!courseToMinorsMap[course].includes(minorName)) {
        courseToMinorsMap[course].push(minorName);
      }
    });
  });
  
  // Find courses that appear in multiple minors
  Object.entries(courseToMinorsMap).forEach(([course, minors]) => {
    if (minors.length > 1) {
      crossMinorOverlaps.push({
        course: course,
        minors: minors
      });
    }
  });
  
  return crossMinorOverlaps;
}

async function checkOverlap() {
  try {
    const areasData = await loadJSON('./shared/areas.json');
    const coreData = await loadJSON('./shared/Cores.json');
    const trackFile = document.getElementById('track').value;
    const trackData = await loadJSON(`./tracks/${trackFile}`);

    const trackCourses = extractAllCourses(trackData).map(cleanCourseCode);
    const coreCourses = extractAllCourses(coreData).map(cleanCourseCode);

    const minorFiles = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    const minorDataList = await Promise.all(minorFiles.map(f => loadJSON(`./minors/${f}`)));

    const areaCourseMap = {};
    areasData.areas.forEach(area => {
      area.courses.forEach(course => {
        areaCourseMap[cleanCourseCode(course)] = { areaNum: area.area, areaName: area.name };
      });
    });

    const majorCourses = new Set([...trackCourses, ...coreCourses]);
    const results = [];
    let totalMajorMinorOverlap = 0;

    minorDataList.forEach((minor, index) => {
      const minorName = minorFiles[index].replace('.json', '');
      const minorCourses = new Set(extractAllCourses(minor).map(cleanCourseCode));
      const trackOverlaps = [];
      const coreOverlaps = [];
      const areaOverlaps = [];
      const electiveOverlaps = [];

      minorCourses.forEach(minorCourse => {
        const cleanedCourse = cleanCourseCode(minorCourse);
        const isStat4XX = /^STAT4\d{2}$/.test(cleanedCourse);
        const isMathStatXXX = /^MATH[34]\d{2}$/.test(cleanedCourse) || /^STAT[34]\d{2}$/.test(cleanedCourse);

        if (coreCourses.includes("STAT4XX") && isStat4XX) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: "STAT4XX" });
          return;
        }

        if (coreCourses.includes("MATH/STATXXX") && isMathStatXXX) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: "MATH/STATXXX" });
          return;
        }

        if (coreCourses.includes(cleanedCourse)) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: null });
          return;
        }

        if (trackCourses.includes(cleanedCourse)) {
          const areaInfo = areaCourseMap[cleanedCourse];
          trackOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Track', area: areaInfo });
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

    let resultHTML = '<h3>📊 Overlap Analysis Results</h3>';
    resultHTML += '<div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 20px;">';
    resultHTML += '<p style="margin: 0; color: #856404; font-weight: 600;">⚠️ Important Information:</p>';
    resultHTML += '<ul style="margin: 10px 0 0 0; padding-left: 20px; color: #856404;">';
    resultHTML += '<li>This tool shows <strong>potential overlaps</strong> between your major and minor(s)</li>';
    resultHTML += '<li>You can have <strong>maximum 2 overlapping courses</strong> between your major and minor</li>';
    resultHTML += '<li>No courses can overlap between different minors</li>';
    resultHTML += '<li><strong>Final course selection requires advisor consultation</strong></li>';
    resultHTML += '</ul></div>';

    const selectedTrack = document.getElementById('track').options[document.getElementById('track').selectedIndex].text;
    const selectedMinors = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.nextElementSibling.textContent);
    resultHTML += `<p><strong>Selected Configuration:</strong> ${selectedTrack} + ${selectedMinors.join(', ')}</p>`;

    resultHTML += '<h4>🎯 Major-Minor Overlaps:</h4>';
if (results.length === 0) {
  resultHTML += '<p>No minors selected for analysis.</p>';
} else {
  results.forEach(result => {
    const filteredTrack = result.trackOverlaps.filter(tc => shouldShowLinearAlgebra(tc.original, trackFile));
    const filteredCore = result.coreOverlaps.filter(c => shouldShowLinearAlgebra(c.original, trackFile));
    const filteredArea = result.areaOverlaps.filter(a => shouldShowLinearAlgebra(a.original, trackFile));
    const filteredElective = result.electiveOverlaps.filter(e => shouldShowLinearAlgebra(e.original, trackFile));

    const all = [
      ...filteredCore.map(o => ({ ...o, category: "Core" })),
      ...filteredTrack.map(o => ({ ...o, category: "Track" })),
      ...filteredArea.map(o => ({ ...o, category: "Area" })),
      ...filteredElective.map(o => ({ ...o, category: "Elective" }))
    ];

    const courseMetaMap = {};
    all.forEach(o => {
      const code = cleanCourseCode(o.course);
      if (o.area?.areaName) {
        courseMetaMap[code] = { areaName: o.area.areaName };
      }
    });

    const overlapCourses = all.map(o => cleanCourseCode(o.course));
    const trackValidation = validateRequirements(overlapCourses, trackData.requirements || [], courseMetaMap);
    const minorValidation = validateRequirements(overlapCourses, result.requirements, courseMetaMap);
    
    // Area requirement validation
    const areaValidation = validateAreaRequirements(overlapCourses, areaCourseMap);

    const grouped = {};
    all.forEach(overlap => {
      let key = overlap.original;
      if (overlap.coreType === "STAT4XX") key = "STAT4XX";
      if (overlap.coreType === "MATH/STATXXX") key = "MATH/STAT 3XX-4XX";
      if (!grouped[key]) grouped[key] = { courses: [], categories: new Set() };
      grouped[key].courses.push(overlap.original);
      grouped[key].categories.add(overlap.category);
    });

    const filteredCount = Object.keys(grouped).length;
    totalMajorMinorOverlap += filteredCount;
    const status = filteredCount <= 2 ? '✅ VALID' : '❌ INVALID';
    const limitNote = filteredCount > 2 ? ` (Limit: 2 courses max)` : '';

    resultHTML += `<p><strong>${result.minor}:</strong> ${filteredCount} overlapping courses ${status}${limitNote}</p>`;

    if (filteredCount > 0) {
      // Create a comprehensive table with overlap and requirement information
      resultHTML += '<table style="width: 100%; margin: 10px 0; border-collapse: collapse; font-size: 14px;">';
      resultHTML += '<thead><tr style="background: #f8f9fa;"><th style="padding: 8px; border: 1px solid #ddd; width: 20%;">Course(s)</th><th style="padding: 8px; border: 1px solid #ddd; width: 25%;">Overlap Category</th><th style="padding: 8px; border: 1px solid #ddd; width: 55%;">Satisfies Requirements</th></tr></thead><tbody>';
      
      // Create a map of courses to their requirement satisfaction
      const courseRequirementMap = {};
      
      // Map track requirements (only satisfied ones)
      trackValidation.results.forEach(req => {
        if (req.status === "✅ Satisfied") {
          req.matched.forEach(course => {
            const cleanCourse = course.replace(/\s*\([^)]*\)/, ''); // Remove area annotations
            if (!courseRequirementMap[cleanCourse]) courseRequirementMap[cleanCourse] = [];
            
            // Determine requirement type for color coding
            let reqType = "Track";
            const reqLower = req.requirement.toLowerCase();
            if (reqLower.includes('core') || reqLower.includes('required') || reqLower.includes('mandatory')) {
              reqType = "Core";
            } else if (reqLower.includes('technical') && reqLower.includes('elective')) {
              reqType = "Technical Elective";
            } else if (reqLower.includes('area') || reqLower.includes('specialization')) {
              reqType = "Area";
            }
            
            courseRequirementMap[cleanCourse].push({label: req.requirement, source: reqType});
          });
        }
      });
      
      // Map minor requirements (only satisfied ones)
      minorValidation.results.forEach(req => {
        if (req.status === "✅ Satisfied") {
          req.matched.forEach(course => {
            const cleanCourse = course.replace(/\s*\([^)]*\)/, ''); // Remove area annotations
            if (!courseRequirementMap[cleanCourse]) courseRequirementMap[cleanCourse] = [];
            
            // Determine requirement type for color coding
            let reqType = "Minor";
            const reqLower = req.requirement.toLowerCase();
            if (reqLower.includes('core') || reqLower.includes('required') || reqLower.includes('mandatory')) {
              reqType = "Core";
            } else if (reqLower.includes('technical') && reqLower.includes('elective')) {
              reqType = "Technical Elective";
            } else if (reqLower.includes('area') || reqLower.includes('specialization')) {
              reqType = "Area";
            }
            
            courseRequirementMap[cleanCourse].push({label: `${req.requirement} (Minor)`, source: reqType});
          });
        }
      });
      
      // Map area requirements
      areaValidation.results.forEach(req => {
        req.matched.forEach(course => {
          if (!courseRequirementMap[course]) courseRequirementMap[course] = [];
          courseRequirementMap[course].push({label: `${req.requirement} (Track)`, source: "Area"});
        });
      });

      Object.entries(grouped).forEach(([key, value]) => {
        const uniqueCourses = [...new Set(value.courses)].sort();
        const categories = [...value.categories].sort();

        const courseDisplay = uniqueCourses.join(', ');
        const categoryDisplay = categories.map(cat => {
          if (key === "STAT4XX" || key === "MATH/STAT 3XX-4XX") {
            return `${cat} (satisfies ${key})`;
          }
          return cat;
        }).join(', ');

        // Get requirement satisfaction info for these courses
        const requirementInfo = [];
        uniqueCourses.forEach(course => {
          if (courseRequirementMap[course]) {
            requirementInfo.push(...courseRequirementMap[course]);
          }
        });
        
const requirementDisplay = requirementInfo.length > 0
  ? requirementInfo.map(info => {
      let color = "#6c757d"; // default gray
      let textColor = "white";
      
      // Enhanced color coding based on requirement type
      if (info.source === "Core") {
        color = "#dc3545"; // Red for core/mandatory requirements
        textColor = "white";
      } else if (info.source === "Technical Elective") {
        color = "#17a2b8"; // Teal for technical electives
        textColor = "white";
      } else if (info.source === "Area") {
        color = "#6f42c1"; // Purple for area requirements
        textColor = "white";
      } else if (info.source === "Track") {
        color = "#007bff"; // Blue for general track requirements
        textColor = "white";
      } else if (info.source === "Minor") {
        color = "#28a745"; // Green for minor requirements
        textColor = "white";
      } else if (info.source === "Elective") {
        color = "#fd7e14"; // Orange for general electives
        textColor = "white";
      }
      
      return `<span style="background:${color}; color:${textColor}; padding:3px 8px; border-radius:5px; margin-right:5px; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">${info.label}</span>`;
    }).join(' ')
  : 'No specific requirements matched';

        resultHTML += `<tr>
          <td style="padding: 8px; border: 1px solid #ddd; vertical-align: top;">${courseDisplay}</td>
          <td style="padding: 8px; border: 1px solid #ddd; vertical-align: top;">${categoryDisplay}</td>
          <td style="padding: 8px; border: 1px solid #ddd; vertical-align: top; font-size: 12px;">${requirementDisplay}</td>
        </tr>`;
      });
      resultHTML += '</tbody></table>';
    }
  });

  resultHTML += `<p><strong>Total Major-Minor Overlap:</strong> ${totalMajorMinorOverlap} courses</p>`;
  // Check for ML Track + Robotics Minor combination
  if (trackFile === "ml_track.json" && minorFiles.includes("Robotics.json")) {
    resultHTML += '<div style="background: #fff3cd; padding: 20px; border-radius: 10px; border-left: 6px solid #ffc107; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">';
    resultHTML += '<div style="display: flex; align-items: center; margin-bottom: 10px;">';
    resultHTML += '<div style="background: #ffc107; color: white; padding: 8px 12px; border-radius: 20px; font-weight: bold; font-size: 14px; margin-right: 15px;">PENDING</div>';
    resultHTML += '<p style="margin: 0; color: #856404; font-weight: 600; font-size: 16px;">⚠️ Special Review Required</p>';
    resultHTML += '</div>';
    resultHTML += '<p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">The Machine Learning track combined with Robotics minor requires additional advisor consultation due to specialized course overlap considerations.</p>';
    resultHTML += '</div>';
  }
  
  // Check for cross-minor overlaps if multiple minors are selected
  if (results.length > 1) {
    const crossMinorOverlaps = checkCrossMinorOverlaps(results);
    if (crossMinorOverlaps.length > 0) {
      resultHTML += '<div style="background: #f8d7da; padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545; margin-top: 20px;">';
      resultHTML += '<p style="margin: 0; color: #721c24; font-weight: 600;">❌ Cross-Minor Overlap Violation:</p>';
      resultHTML += '<p style="margin: 10px 0 0 0; color: #721c24;">The following courses appear in multiple minors, which is not allowed:</p>';
      resultHTML += '<ul style="margin: 10px 0 0 20px; color: #721c24;">';
      crossMinorOverlaps.forEach(overlap => {
        resultHTML += `<li><strong>${overlap.course}</strong> appears in: ${overlap.minors.join(', ')}</li>`;
      });
      resultHTML += '</ul></div>';
    } else {
      resultHTML += '<div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; margin-top: 20px;">';
      resultHTML += '<p style="margin: 0; color: #155724; font-weight: 600;">✅ Cross-Minor Validation Passed:</p>';
      resultHTML += '<p style="margin: 10px 0 0 0; color: #155724;">No courses overlap between different minors.</p>';
      resultHTML += '</div>';
    }
  }
}

document.getElementById('results').innerHTML = resultHTML;
document.getElementById('results').style.display = 'block';
document.getElementById('error').textContent = '';
} catch (err) {
  document.getElementById('results').style.display = 'none';
  document.getElementById('error').textContent = `❌ Error: ${err.message}`;
  console.error(err);
}
}

document.getElementById('overlapForm').addEventListener('submit', e => {
  e.preventDefault();
  checkOverlap();
});
=======
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function cleanCourseCode(course) {
  return course.toUpperCase().replace(/\s+/g, '');
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

function getLinearAlgebraNote(course, trackFile) {
  if (!linearAlgebraTracks.has(trackFile)) return null;
  return course === "MATH341" ? " (must complete MATH340 first)" : "";
}

function shouldShowLinearAlgebra(course, trackFile) {
  const relevantCourses = ["MATH240", "MATH341", "MATH461"];
  return linearAlgebraTracks.has(trackFile) || !relevantCourses.includes(course);
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

  if (Array.isArray(data.courses)) {
    extract(data.courses);
  } else {
    Object.values(data).forEach(extract);
  }

  return Array.from(courses);
}

function getCoreCourseNote(course) {
  if (course === "STAT4XX") {
    return " (Must have MATH141 prerequisite; Cannot be crosslisted with CMSC)";
  }
  if (course === "MATH/STATXXX") {
    return " (Must have MATH141 prerequisite; Cannot be cross-listed with CMSC)";
  }
  return "";
}

function validateRequirements(overlaps, requirements, courseMetaMap = {}) {
  const usedCourses = new Set();
  const results = [];

  requirements.forEach(req => {
    const matched = req.options?.filter(course => overlaps.includes(course)) || [];
    let status = "❌ Unmet";

    if (req.type === "all") {
      status = matched.length === req.options.length ? "✅ Satisfied" : "⚠️ Partially Met";
    } else if (req.type === "chooseOne") {
      status = matched.length >= 1 ? "✅ Satisfied" : "❌ Unmet";
    } else if (req.type === "chooseN") {
      status = matched.length >= req.count ? "✅ Satisfied" : `⚠️ Only ${matched.length} of ${req.count}`;
    } else if (req.type === "creditMinimum") {
      const validCourses = overlaps.filter(course => {
        const prefixMatch = course.startsWith(req.filters.prefix);
        const levelMatch = parseInt(course.slice(-3)) >= req.filters.level;
        const excluded = req.filters.excluded || [];
        return prefixMatch && levelMatch && !excluded.includes(course);
      });
      const totalCredits = validCourses.reduce((sum, course) => {
        const match = course.match(/\((\d+)\)/);
        return sum + (match ? parseInt(match[1]) : 3);
      }, 0);
      status = totalCredits >= req.credits ? "✅ Satisfied" : `⚠️ Only ${totalCredits} of ${req.credits} credits`;
      matched.push(...validCourses);
    }

    matched.forEach(c => usedCourses.add(c));

    const annotated = matched.map(c => {
      const meta = courseMetaMap[c];
      return meta?.areaName ? `${c} (${meta.areaName})` : c;
    });

    results.push({
      requirement: req.name,
      category: req.category,
      matched: annotated,
      status
    });
  });

  return { results, usedCourses };
}

function validateAreaRequirements(overlaps, areaCourseMap) {
  const areaResults = [];
  const areaCounts = {};
  
  // Count courses per area
  overlaps.forEach(course => {
    const areaInfo = areaCourseMap[course];
    if (areaInfo) {
      const areaNum = areaInfo.areaNum;
      if (!areaCounts[areaNum]) {
        areaCounts[areaNum] = { count: 0, courses: [], areaName: areaInfo.areaName };
      }
      areaCounts[areaNum].count++;
      areaCounts[areaNum].courses.push(course);
    }
  });
  
  // Create area requirement results
  Object.entries(areaCounts).forEach(([areaNum, data]) => {
    if (data.count > 0) {
      areaResults.push({
        requirement: `Area ${areaNum} (${data.areaName})`,
        category: "Area",
        matched: data.courses,
        status: "✅ Satisfied"
      });
    }
  });
  
  return { results: areaResults };
}

function checkCrossMinorOverlaps(results) {
  const courseToMinorsMap = {};
  const crossMinorOverlaps = [];
  
  // Build a map of courses to the minors they appear in
  results.forEach(result => {
    const minorName = result.minor;
    const allOverlaps = [
      ...result.trackOverlaps,
      ...result.coreOverlaps,
      ...result.areaOverlaps,
      ...result.electiveOverlaps
    ];
    
    allOverlaps.forEach(overlap => {
      const course = cleanCourseCode(overlap.course);
      if (!courseToMinorsMap[course]) {
        courseToMinorsMap[course] = [];
      }
      if (!courseToMinorsMap[course].includes(minorName)) {
        courseToMinorsMap[course].push(minorName);
      }
    });
  });
  
  // Find courses that appear in multiple minors
  Object.entries(courseToMinorsMap).forEach(([course, minors]) => {
    if (minors.length > 1) {
      crossMinorOverlaps.push({
        course: course,
        minors: minors
      });
    }
  });
  
  return crossMinorOverlaps;
}

async function checkOverlap() {
  try {
    const areasData = await loadJSON('./shared/areas.json');
    const coreData = await loadJSON('./shared/Cores.json');
    const trackFile = document.getElementById('track').value;
    const trackData = await loadJSON(`./tracks/${trackFile}`);

    const trackCourses = extractAllCourses(trackData).map(cleanCourseCode);
    const coreCourses = extractAllCourses(coreData).map(cleanCourseCode);

    const minorFiles = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    const minorDataList = await Promise.all(minorFiles.map(f => loadJSON(`./minors/${f}`)));

    const areaCourseMap = {};
    areasData.areas.forEach(area => {
      area.courses.forEach(course => {
        areaCourseMap[cleanCourseCode(course)] = { areaNum: area.area, areaName: area.name };
      });
    });

    const majorCourses = new Set([...trackCourses, ...coreCourses]);
    const results = [];
    let totalMajorMinorOverlap = 0;

    minorDataList.forEach((minor, index) => {
      const minorName = minorFiles[index].replace('.json', '');
      const minorCourses = new Set(extractAllCourses(minor).map(cleanCourseCode));
      const trackOverlaps = [];
      const coreOverlaps = [];
      const areaOverlaps = [];
      const electiveOverlaps = [];

      minorCourses.forEach(minorCourse => {
        const cleanedCourse = cleanCourseCode(minorCourse);
        const isStat4XX = /^STAT4\d{2}$/.test(cleanedCourse);
        const isMathStatXXX = /^MATH[34]\d{2}$/.test(cleanedCourse) || /^STAT[34]\d{2}$/.test(cleanedCourse);

        if (coreCourses.includes("STAT4XX") && isStat4XX) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: "STAT4XX" });
          return;
        }

        if (coreCourses.includes("MATH/STATXXX") && isMathStatXXX) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: "MATH/STATXXX" });
          return;
        }

        if (coreCourses.includes(cleanedCourse)) {
          coreOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Core', coreType: null });
          return;
        }

        if (trackCourses.includes(cleanedCourse)) {
          const areaInfo = areaCourseMap[cleanedCourse];
          trackOverlaps.push({ course: cleanedCourse, original: minorCourse, source: 'Track', area: areaInfo });
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

    let resultHTML = '<h3>📊 Overlap Analysis Results</h3>';
    resultHTML += '<div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 20px;">';
    resultHTML += '<p style="margin: 0; color: #856404; font-weight: 600;">⚠️ Important Information:</p>';
    resultHTML += '<ul style="margin: 10px 0 0 0; padding-left: 20px; color: #856404;">';
    resultHTML += '<li>This tool shows <strong>potential overlaps</strong> between your major and minor(s)</li>';
    resultHTML += '<li>You can have <strong>maximum 2 overlapping courses</strong> between your major and minor</li>';
    resultHTML += '<li>No courses can overlap between different minors</li>';
    resultHTML += '<li><strong>Final course selection requires advisor consultation</strong></li>';
    resultHTML += '</ul></div>';

    const selectedTrack = document.getElementById('track').options[document.getElementById('track').selectedIndex].text;
    const selectedMinors = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.nextElementSibling.textContent);
    resultHTML += `<p><strong>Selected Configuration:</strong> ${selectedTrack} + ${selectedMinors.join(', ')}</p>`;

    resultHTML += '<h4>🎯 Major-Minor Overlaps:</h4>';
if (results.length === 0) {
  resultHTML += '<p>No minors selected for analysis.</p>';
} else {
  results.forEach(result => {
    const filteredTrack = result.trackOverlaps.filter(tc => shouldShowLinearAlgebra(tc.original, trackFile));
    const filteredCore = result.coreOverlaps.filter(c => shouldShowLinearAlgebra(c.original, trackFile));
    const filteredArea = result.areaOverlaps.filter(a => shouldShowLinearAlgebra(a.original, trackFile));
    const filteredElective = result.electiveOverlaps.filter(e => shouldShowLinearAlgebra(e.original, trackFile));

    const all = [
      ...filteredCore.map(o => ({ ...o, category: "Core" })),
      ...filteredTrack.map(o => ({ ...o, category: "Track" })),
      ...filteredArea.map(o => ({ ...o, category: "Area" })),
      ...filteredElective.map(o => ({ ...o, category: "Elective" }))
    ];

    const courseMetaMap = {};
    all.forEach(o => {
      const code = cleanCourseCode(o.course);
      if (o.area?.areaName) {
        courseMetaMap[code] = { areaName: o.area.areaName };
      }
    });

    const overlapCourses = all.map(o => cleanCourseCode(o.course));
    const trackValidation = validateRequirements(overlapCourses, trackData.requirements || [], courseMetaMap);
    const minorValidation = validateRequirements(overlapCourses, result.requirements, courseMetaMap);
    
    // Area requirement validation
    const areaValidation = validateAreaRequirements(overlapCourses, areaCourseMap);

    const grouped = {};
    all.forEach(overlap => {
      let key = overlap.original;
      if (overlap.coreType === "STAT4XX") key = "STAT4XX";
      if (overlap.coreType === "MATH/STATXXX") key = "MATH/STAT 3XX-4XX";
      if (!grouped[key]) grouped[key] = { courses: [], categories: new Set() };
      grouped[key].courses.push(overlap.original);
      grouped[key].categories.add(overlap.category);
    });

    const filteredCount = Object.keys(grouped).length;
    totalMajorMinorOverlap += filteredCount;
    const status = filteredCount <= 2 ? '✅ VALID' : '❌ INVALID';
    const limitNote = filteredCount > 2 ? ` (Limit: 2 courses max)` : '';

    resultHTML += `<p><strong>${result.minor}:</strong> ${filteredCount} overlapping courses ${status}${limitNote}</p>`;

    if (filteredCount > 0) {
      // Create a comprehensive table with overlap and requirement information
      resultHTML += '<table style="width: 100%; margin: 10px 0; border-collapse: collapse; font-size: 14px;">';
      resultHTML += '<thead><tr style="background: #f8f9fa;"><th style="padding: 8px; border: 1px solid #ddd; width: 20%;">Course(s)</th><th style="padding: 8px; border: 1px solid #ddd; width: 25%;">Overlap Category</th><th style="padding: 8px; border: 1px solid #ddd; width: 55%;">Satisfies Requirements</th></tr></thead><tbody>';
      
      // Create a map of courses to their requirement satisfaction
      const courseRequirementMap = {};
      
      // Map track requirements (only satisfied ones)
      trackValidation.results.forEach(req => {
        if (req.status === "✅ Satisfied") {
          req.matched.forEach(course => {
            const cleanCourse = course.replace(/\s*\([^)]*\)/, ''); // Remove area annotations
            if (!courseRequirementMap[cleanCourse]) courseRequirementMap[cleanCourse] = [];
            
            // Determine requirement type for color coding
            let reqType = "Track";
            const reqLower = req.requirement.toLowerCase();
            if (reqLower.includes('core') || reqLower.includes('required') || reqLower.includes('mandatory')) {
              reqType = "Core";
            } else if (reqLower.includes('technical') && reqLower.includes('elective')) {
              reqType = "Technical Elective";
            } else if (reqLower.includes('area') || reqLower.includes('specialization')) {
              reqType = "Area";
            }
            
            courseRequirementMap[cleanCourse].push({label: req.requirement, source: reqType});
          });
        }
      });
      
      // Map minor requirements (only satisfied ones)
      minorValidation.results.forEach(req => {
        if (req.status === "✅ Satisfied") {
          req.matched.forEach(course => {
            const cleanCourse = course.replace(/\s*\([^)]*\)/, ''); // Remove area annotations
            if (!courseRequirementMap[cleanCourse]) courseRequirementMap[cleanCourse] = [];
            
            // Determine requirement type for color coding
            let reqType = "Minor";
            const reqLower = req.requirement.toLowerCase();
            if (reqLower.includes('core') || reqLower.includes('required') || reqLower.includes('mandatory')) {
              reqType = "Core";
            } else if (reqLower.includes('technical') && reqLower.includes('elective')) {
              reqType = "Technical Elective";
            } else if (reqLower.includes('area') || reqLower.includes('specialization')) {
              reqType = "Area";
            }
            
            courseRequirementMap[cleanCourse].push({label: `${req.requirement} (Minor)`, source: reqType});
          });
        }
      });
      
      // Map area requirements
      areaValidation.results.forEach(req => {
        req.matched.forEach(course => {
          if (!courseRequirementMap[course]) courseRequirementMap[course] = [];
          courseRequirementMap[course].push({label: `${req.requirement} (Track)`, source: "Area"});
        });
      });

      Object.entries(grouped).forEach(([key, value]) => {
        const uniqueCourses = [...new Set(value.courses)].sort();
        const categories = [...value.categories].sort();

        const courseDisplay = uniqueCourses.join(', ');
        const categoryDisplay = categories.map(cat => {
          if (key === "STAT4XX" || key === "MATH/STAT 3XX-4XX") {
            return `${cat} (satisfies ${key})`;
          }
          return cat;
        }).join(', ');

        // Get requirement satisfaction info for these courses
        const requirementInfo = [];
        uniqueCourses.forEach(course => {
          if (courseRequirementMap[course]) {
            requirementInfo.push(...courseRequirementMap[course]);
          }
        });
        
const requirementDisplay = requirementInfo.length > 0
  ? requirementInfo.map(info => {
      let color = "#6c757d"; // default gray
      let textColor = "white";
      
      // Enhanced color coding based on requirement type
      if (info.source === "Core") {
        color = "#dc3545"; // Red for core/mandatory requirements
        textColor = "white";
      } else if (info.source === "Technical Elective") {
        color = "#17a2b8"; // Teal for technical electives
        textColor = "white";
      } else if (info.source === "Area") {
        color = "#6f42c1"; // Purple for area requirements
        textColor = "white";
      } else if (info.source === "Track") {
        color = "#007bff"; // Blue for general track requirements
        textColor = "white";
      } else if (info.source === "Minor") {
        color = "#28a745"; // Green for minor requirements
        textColor = "white";
      } else if (info.source === "Elective") {
        color = "#fd7e14"; // Orange for general electives
        textColor = "white";
      }
      
      return `<span style="background:${color}; color:${textColor}; padding:3px 8px; border-radius:5px; margin-right:5px; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">${info.label}</span>`;
    }).join(' ')
  : 'No specific requirements matched';

        resultHTML += `<tr>
          <td style="padding: 8px; border: 1px solid #ddd; vertical-align: top;">${courseDisplay}</td>
          <td style="padding: 8px; border: 1px solid #ddd; vertical-align: top;">${categoryDisplay}</td>
          <td style="padding: 8px; border: 1px solid #ddd; vertical-align: top; font-size: 12px;">${requirementDisplay}</td>
        </tr>`;
      });
      resultHTML += '</tbody></table>';
    }
  });

  resultHTML += `<p><strong>Total Major-Minor Overlap:</strong> ${totalMajorMinorOverlap} courses</p>`;
  // Check for ML Track + Robotics Minor combination
  if (trackFile === "ml_track.json" && minorFiles.includes("Robotics.json")) {
    resultHTML += '<div style="background: #fff3cd; padding: 20px; border-radius: 10px; border-left: 6px solid #ffc107; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">';
    resultHTML += '<div style="display: flex; align-items: center; margin-bottom: 10px;">';
    resultHTML += '<div style="background: #ffc107; color: white; padding: 8px 12px; border-radius: 20px; font-weight: bold; font-size: 14px; margin-right: 15px;">PENDING</div>';
    resultHTML += '<p style="margin: 0; color: #856404; font-weight: 600; font-size: 16px;">⚠️ Special Review Required</p>';
    resultHTML += '</div>';
    resultHTML += '<p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">The Machine Learning track combined with Robotics minor requires additional advisor consultation due to specialized course overlap considerations.</p>';
    resultHTML += '</div>';
  }
  
  // Check for cross-minor overlaps if multiple minors are selected
  if (results.length > 1) {
    const crossMinorOverlaps = checkCrossMinorOverlaps(results);
    if (crossMinorOverlaps.length > 0) {
      resultHTML += '<div style="background: #f8d7da; padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545; margin-top: 20px;">';
      resultHTML += '<p style="margin: 0; color: #721c24; font-weight: 600;">❌ Cross-Minor Overlap Violation:</p>';
      resultHTML += '<p style="margin: 10px 0 0 0; color: #721c24;">The following courses appear in multiple minors, which is not allowed:</p>';
      resultHTML += '<ul style="margin: 10px 0 0 20px; color: #721c24;">';
      crossMinorOverlaps.forEach(overlap => {
        resultHTML += `<li><strong>${overlap.course}</strong> appears in: ${overlap.minors.join(', ')}</li>`;
      });
      resultHTML += '</ul></div>';
    } else {
      resultHTML += '<div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; margin-top: 20px;">';
      resultHTML += '<p style="margin: 0; color: #155724; font-weight: 600;">✅ Cross-Minor Validation Passed:</p>';
      resultHTML += '<p style="margin: 10px 0 0 0; color: #155724;">No courses overlap between different minors.</p>';
      resultHTML += '</div>';
    }
  }
}

document.getElementById('results').innerHTML = resultHTML;
document.getElementById('results').style.display = 'block';
document.getElementById('error').textContent = '';
} catch (err) {
  document.getElementById('results').style.display = 'none';
  document.getElementById('error').textContent = `❌ Error: ${err.message}`;
  console.error(err);
}
}

document.getElementById('overlapForm').addEventListener('submit', e => {
  e.preventDefault();
  checkOverlap();
});
>>>>>>> 4e2d5012ecb687ae84f35892005c0958891dc4b8
