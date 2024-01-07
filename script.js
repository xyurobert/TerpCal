const site = window.location.href;
const svgHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="16" width="14" viewBox="0 0 448 512"><!--!Font Awesome Free 6.5.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path fill="#ffffff" d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>';

if (site.includes("app.testudo.umd.edu/#/main/schedule")) {

  // Use a MutationObserver to wait for the DOM changes
  const observer = new MutationObserver((mutations, obs) => {
    const schedule = document.getElementsByClassName('schedule-header--button');

    if (schedule.length > 0) {

      obs.disconnect(); // Stop observing once we've found our target element

      // Create buttons
      const addButton = document.createElement('button');
      const deleteButton = document.createElement('button');
      addButton.className = 'primary-button schedule-header--button-left ng-scope';
      deleteButton.className = 'primary-button schedule-header--button-left ng-scope';
      addButton.id = 'addButton';
      deleteButton.id = 'deleteButton';
      addButton.innerHTML = `${svgHTML} &nbsp;Add/Update`;
      deleteButton.innerHTML = `${svgHTML} &nbsp;Delete`;

      // Insert buttons into the DOM, add event listeners, etc. as in your existing code
      const schedule_buttons = schedule[0];
      if (schedule_buttons.firstChild) {
        schedule_buttons.insertBefore(addButton, schedule_buttons.firstChild);
        schedule_buttons.insertBefore(deleteButton, schedule_buttons.firstChild);
      } else {

        schedule_buttons.appendChild(addButton);
        schedule_buttons.appendChild(deleteButton);
      }   
      addButton.addEventListener("click", add_data);
      deleteButton.addEventListener("click", delete_data);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

}

function add_data() {
  disableButtons("add");
  let classes = collect_data();
  chrome.runtime.sendMessage({addClasses: classes}, (response) => {
    if (response.status === 'success') {
      console.log("Classes added successfully");
    } else if (response.status === 'error') {
      console.error("Error adding classes:");
    }
    enableButtons(); // Re-enable buttons once message handling is complete
  });
}

function delete_data() {
  disableButtons(); // Disable buttons when the process starts
  let classes = collect_data();
  chrome.runtime.sendMessage({deleteClasses: classes}, (response) => {
    if (response.status === 'success') {
      console.log("Classes deleted successfully");
    } else if (response.status === 'error') {
      console.error("Error deleting classes");
    }
    enableButtons(); // Re-enable buttons once message handling is complete
  });
}

function collect_data() {

  let allClassDetails = [];

  // Retrieve the current URL
  const currentURL = window.location.href;

  let termId = currentURL.slice(-6);
  // Main overarching div containing all of registered classes
  var classID = "list_course_registered_"
  var classes = document.querySelectorAll(`[id^=${classID}]`);

  //for each class
  classes.forEach((classElement) => {
    
    //retreives the class name
    let className = classElement.getElementsByClassName("course-card-label ng-binding")[0].innerText;

    //text of the schedule
    let innerDivs = classElement.getElementsByClassName("course-card-row--flex-justify course-card-activity--container ng-scope");

    //iterate through each div of the class; collect text
    for (let i = 0; i < innerDivs.length; i++) {
      let childDivs = innerDivs[i].getElementsByTagName('div');
      console.log(childDivs);

      let classType = childDivs[0].innerText;
      let classTime = childDivs[1].innerText;
      let classLocation = childDivs[2].innerText;

      console.log(`Term: ${termId}, Name: ${className}, Type: ${classType}, Time: ${classTime}, Location: ${classLocation}`);

      let classDetails = {
        term: termId,
        name: className,
        type: classType,
        time: classTime,
        location: classLocation
      };

      allClassDetails.push(classDetails);
    }
  })

  return allClassDetails
}

function disableButtons(target) {
  if(target === 'add') {
    document.getElementById('addButton').innerText = "Processing...";
  } else {
    document.getElementById('deleteButton').innerText = "Processing...";
  }
  document.getElementById('addButton').disabled = true;
  document.getElementById('deleteButton').disabled = true;
}

function enableButtons() {
  document.getElementById('addButton').disabled = false;
  document.getElementById('deleteButton').disabled = false;
  document.getElementById('addButton').innerHTML = `${svgHTML} &nbsp;Add/Update`;
  document.getElementById('deleteButton').innerHTML = `${svgHTML} &nbsp;Delete`;
}