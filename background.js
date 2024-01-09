let oauthToken;
let weekDay = ["MO", "TU", "WE", "TH", "FR"]

chrome.runtime.onInstalled.addListener(() => {
  chrome.identity.getAuthToken({ interactive: true }, function(token) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }
    
    oauthToken = token;
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  //I can't make this an async function because when I return true, it's actually returning "Promise.resolve(true)". 
  //The solution is to use an Immediately Invoked Function Expression that allows me to use await
  //At the end, I can return true outside of the IIFE
  (async () => { 
    try {
      if (request.addClasses) {
        let term = request.addClasses[0].term;
        let existingClasses = await getAllExistingClasses(term);
        let existingClassSet = new Set(existingClasses.map(event => event.extendedProperties.private.name));
        let newClassSet = new Set(request.addClasses.map(course => course.name + course.type));

        let classesToAdd = request.addClasses.filter(course => !existingClassSet.has(course.name + course.type));
        let classesToDelete = existingClasses.filter(course => !newClassSet.has(course.extendedProperties.private.name));

        console.log("Classes to add: ", classesToAdd);
        console.log("Classes to delete: ", classesToDelete);
        await Promise.all(
          classesToAdd.map(course => makeEvent(course)).concat(classesToDelete.map(course => deleteEvent(course.id)))
        );
        redirect(term);
        sendResponse({status: 'success'}); // Send success response back to script.js
      } else if (request.deleteClasses) {
        let term = request.deleteClasses[0].term;
        let classesToDelete = await getAllExistingClasses(term);
        console.log("Classes to delete: ", classesToDelete);
        //if classesToDelete is empty, do nothing

        await Promise.all(classesToDelete.map(course => deleteEvent(course.id)));
        redirect(term);
        sendResponse({status: 'success'});
      } else {
        console.error("Classes not received");
        sendResponse({status: 'error'});
      }
    } catch (error) {
      console.error('Error in operation: ', error); //error appears here, maybe try oauth
      sendResponse({status: 'error', message: error.message}); // Send error response back to script.js
    }
  })();

  return true;  // Keep the message channel open for the async response
});


async function makeEvent(course, attempt = 0) {
  const maxRetries = 3; 
  return new Promise(async (resolve, reject) => {
    if (course.time !== "TBA") {
      let classDays = [0,0,0,0,0];
      let type;
  
      //getting name and section
      let name = course.name.replace(/\(.*?\)/, '').trim();; 
      let section = course.name.match(/\(.*?\)/);
      section = section ? section[0] : '';
  
      //getting class days
      let scheduleParts = course.time.split(' ');
      //console.log("Schedule Parts: " + scheduleParts);
      let days = scheduleParts[0]
      while(days.length > 0) {
        if(days.length > 1 && days.slice(0,2) == "Th") {
          classDays[3] = 1;
          days = days.slice(1);
        } else if (days[0] == "M") {
          classDays[0] = 1;
        } else if (days[0] == "T") {
          classDays[1] = 1;
        } else if (days[0] == "W") {
          classDays[2] = 1;
        } else if (days[0] == "F") {
          classDays[4] = 1;
        }
        days = days.slice(1)
      }
      //console.log("course: " + course.time);

      //formatting time start and end

      if (course.type == "Lec") {
        type = "Lecture"
      } else if (course.type == "Dis") {
        type = "Discussion"
      } else {
        type = "FINAL"
      }
      let timeStart;
      let timeEnd; 
      let finalStart;

      if (type !== "FINAL") {
        timeStart = convertTo24Hour(scheduleParts[1])
        timeEnd = convertTo24Hour(scheduleParts[3])
      } else {
        timeStart = convertTo24Hour(scheduleParts[2] + scheduleParts[3]);

        let parts = timeStart.split(":");
        const date = new Date();
        date.setHours(parts[0], parts[1], parts[2]);
        date.setHours(date.getHours() + 2);
        timeEnd = date.toTimeString().split(" ")[0];

        finalStart = reformatFinalDate(scheduleParts[0])
      }
  
      //calculating start date
      let semesterStart;
      let semesterEnd;
      if (course.term == "202401") {
        semesterStart = "2024-01-24"
  
        for(let i = 2; i < 7; i++) {
  
          if (classDays[i % 5] == 1) {
            let day = 25 + (i%5) - 3
            semesterStart = "2024-01-" + day
            break
          }
  
        }
        semesterEnd = "20240510T000000Z"
      }
      
      if (course.term == "202308") {
        semesterStart = "2023-08-28"
  
        for(let i = 0; i < 5; i++) {
          if (classDays[i] == 1) {
            let day = 28 + i;
            if(day === 32) {
              semesterStart = "2023-09-01";
              break;
            } else {
              semesterStart = "2023-08-" + day;
              break
            }
          }
        }
        semesterEnd = "20231212T000000Z"
      }
  
      //creating api-compatible days
      let format_days = ''
      for(let j = 0; j < classDays.length; j++) {
        if (classDays[j] == 1) {
          format_days += weekDay[j] + ','
        }
      }
      format_days = format_days.slice(0, -1);
      
      let event; 
      if (type !== "FINAL") {
        event = {
          'summary': name + " " + type,
          'location': course.location,
          'description': "Section: " + section,
          'start': {
            'dateTime': semesterStart + 'T' + timeStart,
            'timeZone': 'America/New_York'
          },
          'end': {
            'dateTime': semesterStart + 'T' + timeEnd,
            'timeZone': 'America/New_York'
          },
          'recurrence': ["RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=" + format_days + ";UNTIL=" + semesterEnd],
    
          //extended property. term identifies what term it is a part of, name is a unique id that is used to identify specific class for creation/deletion
          'extendedProperties': {
            'private':{
              'term': course.term,
              'name': course.name + course.type
            }
          }
        };
      } 
      else {
        event = {
          'summary': name + " " + type,
          'location': course.location,
          'description': "Section: " + section,
          'start': {
            'dateTime': finalStart + 'T' + timeStart,
            'timeZone': 'America/New_York'
          },
          'end': {
            'dateTime': finalStart + 'T' + timeEnd,
            'timeZone' : 'America/New_York'
          },
          'extendedProperties': {
            'private': {
              'term': course.term,
              'name': course.name + course.type
            }
          }
        }
      }
    
      //actually calling the api
      try {
        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: new Headers({
            'Authorization': 'Bearer ' + oauthToken,
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(event)
        });
    
        if (response.ok) {
          // const data = await response.json();
          console.log('Created event: ', event);
          resolve();
        } else if ((response.status === 401 || response.status === 403) && attempt <= maxRetries) {
          console.log("ERROR: " + response)
          console.log(`Token might be expired. Attempting to refresh and retry (Attempt ${attempt + 1} of ${maxRetries})`);
          await refreshToken();
          resolve(makeEvent(course, attempt + 1)); // Resolve with the result of the retry

        } else {
          reject(new Error(`Error creating event: ${await response.text()}`));
          
        }
      } catch (error) {
        console.error('Request failed: ', error);
        reject('Request failed');
      } 
    } else {
      console.log('Course time is TBA, not creating event for: ' + course.name);
      resolve();
    }
  });
}

async function deleteEvent(eventId, attempt = 0) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: 'DELETE',
        headers: new Headers({
          'Authorization': 'Bearer ' + oauthToken
        })
      });
      if (response.ok) {
        console.log(`Deleted event with ID: ${eventId}`);
        resolve();
      } else if ((response.status === 401 || response.status === 403) && attempt <= maxRetries) {
        console.log("ERROR: " + response)
        console.log(`Token might be expired. Attempting to refresh and retry (Attempt ${attempt + 1} of ${maxRetries})`);
        await refreshToken();
        resolve(deleteEvent(eventId, attempt + 1)); 
      } else {
        console.log('Error deleting event')
        reject(new Error(`Error creating event: ${await response.text()}`));
      }
    } catch (error) {
      console.error(`Request failed for event with ID: ${eventId}`, error);
      reject('Request Failed')
    }
  });
}

function convertTo24Hour(time) {
  let modifier = time.slice(-2);

  let [hours, minutes] = time.split(':');
  if (hours === '12') {
    hours = '00';
  }
  if (modifier === 'pm') {
    hours = parseInt(hours, 10) + 12;
  }
  minutes = minutes.slice(0,-2)
  return hours + ':' + minutes + ':00';
}

function reformatFinalDate(finalDate) {
  let parts = finalDate.split("/");
  const year = parseInt(parts[2], 10) + 2000;
  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  const reformattedDate = `${year}-${month}-${day}`;
  return reformattedDate;
}

async function getAllExistingClasses(term) {
  //console.log("Getting all classes with term " + term);

  let allEvents = [];
  let pageToken = null;
  const encodedTerm = encodeURIComponent(term);  // Ensure the term is URL-encoded

  try {
    do {
      let url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=term=${encodedTerm}`;
      
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: new Headers({
          'Authorization': 'Bearer ' + oauthToken
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      allEvents = allEvents.concat(data.items || []);

      pageToken = data.nextPageToken;
    } while (pageToken);

    return allEvents;
  } catch (error) {
    console.error('Error retrieving events', error);
    return []; // Return an empty array on error
  }
}

function redirect(term) {
  let url;
  if(term === "202401") {
    url = 'https://calendar.google.com/calendar/u/0/r/week/2024/1/22';
  } else if (term === "202308") {
    url = 'https://calendar.google.com/calendar/u/0/r/week/2023/8/28';
  }

  if(url) {
    chrome.tabs.create({ url: url });
  }
}

function refreshToken() {

  return new Promise((resolve, reject) => {
    chrome.identity.removeCachedAuthToken({token: oauthToken}, function() {
      chrome.identity.getAuthToken({ interactive: true }, function(token) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
          return;
        }
        
        oauthToken = token;
        resolve();

      });
    });
  });
}