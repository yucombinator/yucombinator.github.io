Vue.transition('slide', {
  enterClass: 'slideInDown',
  leaveClass: 'slideOutUp'
})

Vue.component('listing', {
  props: ['project'],
  template: '<li class="project"> \
              <div class="project__headline"> \
                <a class="project__title" href="{{project.url.url||project.source_url.url}}">{{project.name}}</a> \
              </div> \
              <div class="project__inset"> \
                <p>{{project.description}}</p> \
                <small v-if="project.tech" class="text-muted tech"><i class="fa fa-cogs"></i> {{project.tech}}</small> \
                <small v-if="project.source_url" class="text-muted tech"><a href="{{project.source_url.url}}"><i class="fa fa-github"></i> Source</a></small> \
                <small class="text-muted"><i class="fa fa-calendar-o"></i> {{project.date}}</small> \
              </div> \
            </li>'
});

Vue.component('initiative', {
  props: ['project'],
  template: '<li class="project">\
              <div class="project__headline">\
                <img v-if="project.icon" class="project__icon" :src="project.icon" alt="{{project.name}}"/>\
                <a class="project__title" href="{{project.url.url||project.source_url.url}}">{{project.name}}</a>\
              </div>\
              <div class="project__inset">\
                <p>{{project.description}}</p>\
              </div>\
          </li>'
});

Vue.component('work', {
  props: ['work'],
  template: '<li class="project">\
              <div class="project__headline">\
                <span class="project__title">{{work.position}}</span>\
              </div>\
              <div class="project__inset">\
                <small>\
                  <a href="{{work.url}}">{{work.company}}</a>. \
                  {{work.location}}. \
                  {{work.date}}.\
                </small>\
              </div>\
          </li>'
});

new Vue({
  el: '#dynamic',
  ready: function () {
    var that = this;
    window.addEventListener('scroll', function () {
      scrollObject = {
        x: window.pageXOffset,
        y: window.pageYOffset
      };
      that.hasScrolled = scrollObject.y > 400;
    });
  },
  methods: {
    fullIconPath: function(icon) {
      return '/img/' + icon;
    },
    secret: function(){
        this.showSecret = true;
        Terminal.init(document.getElementById("terminal"), this.commands);
    }
  },
  data: {
    hasScrolled: false,
    showSecret: false,
    
    commands:{
        help: function() {
            return '<p>Available commands: freecode</p>'
        }
    },

    works:[
        {
            position: "Software Developer",
            company: "Microsoft",
            url:"https://mcec.microsoft.ca/",
            location:"Vancouver, BC",
            date:"Sept 2016 - now"
        },{
            position: "Software Developer",
            company: "Confide",
            url:"http://getconfide.com",
            location:"New York City",
            date:"Jan - April 2016"
        }, {
            position: "Android Mobile Developer",
            company: "TextNow",
            url:"http://textnow.com",
            location:"Waterloo, Ontario",
            date:"May - December 2015"
        }, {
            position: "Mobile Developer",
            company: "Hack The North",
            url:"http://hackthenorth.com",
            location:"Waterloo, Ontario",
            date:"Jan - September 2015"
        },
    ],
    
    initiatives:[
        {
            name: "Tech Retreat",
            description: "I co-founded and helped organize a hackathon and learnathon for 160 high school students in Southern Ontario, Canada.",
            icon:"/img/tr-icon.jpg",
            url:{
                name:"Website",
                url: "http://techretreat.ca/"}
        }, {
            name: "TerribleHack",
            description: "I co-founded TerribleHack, a comedy hackathon that takes place every term at the University centered around making useless hacks. Now in its 3rd iteration.",
            icon:"/img/th-icon.jpg",
            url:{
                name:"Website",
                url: "http://waterloo.terriblehack.com/"}
        },
    ],
    
    projects: [{
        name: "Rewind",
        description: "Rewind allows you to passively record your surroundings.",
        url:{
            name:"Play",
            url: "https://play.google.com/store/apps/details?id=icechen1.com.blackbox&hl=en"
        },
        source_url:{
          name:"Source",
          url: "https://github.com/icechen1/blackbox"
        },
        type: "android",
        tech: "Android",
        date:"February 2016"
    },{
        name: "l33t hax0r",
        description: "l33t hax0r is a multiplayer cooperative hacking simulator game.",
        url:{
            name:"Play",
            url: "http://playl33t.com/"
          },
        source_url:{
          name:"Source",
          url: "https://github.com/icechen1/l33t"
        },
        type: "web",
        tech: "Web",
        date:"February 2016"
    },{
        name: "TechTanks",
        description: "TechTanks is a programming game. Code your own tank, fight others and learn Ruby.",
        url:{
            name:"Play",
            url: "http://techtanks.techretreat.ca/"
        },
        source_url:{
          name:"Source",
          url: "https://github.com/TechRetreat/game"
        },
        type: "web",
        tech: "Ruby on Rails",
        date:"August 2015"
    }, {
        name: "Notable",
        description: "Notable allows you to create notification reminders on the go.",
        type: "android",
        date: "2013",
        tech: "Android",
        url:{
            name:"Play Store",
            url: "https://play.google.com/store/apps/details?id=com.icechen1.notable"}
    },{
        name: "SleepyTime",
        description: "SleepyTime is an app designed to help you sleep better and allows you to start the day with a clear mind.",
        type: "android",
        date: "2013",
        tech: "Android",
        url:{
            name:"Play Store",
            url: "https://play.google.com/store/apps/details?id=com.icechen1.sleepytime"}
    }, {
        name: "SpeechJammer",
        description: "SpeechJammer uses the Delayed Auditory Feedback effect to inhibit speech on the user, for fun.",
        type: "android",
        tech: "Android",
        date: "2013",
        url:{
            name:"Play Store",
            url: "https://play.google.com/store/apps/details?id=com.icechen1.speechjammer"}
    }],
    
    experiments:[{
        name: "The Sound of Giving",
        description: "Visualization site for listening to Kiva microloans in real time",
        url:{
            name:"Webapp",
            url: "/soundofgiving/"},
        source_url: null,
        type: "web",
        tech: "Web",
        date:"March 2016"
    }, {
        name: "BeerNow",
        description: "Ruby webapp to find the cheapest beer in Ontario, as measured by ABV",
        url:{
            name:"Webapp",
            url: "http://beernow.ca/"
        },
        source_url:{
          name:"Source",
          url: "https://github.com/icechen1/beerhunter"
        },
        type: "web",
        tech: "Ruby on Rails",
        date:"July 2015"
    },{
        name: "Swipler",
        description:"Chrome extension that allows you to control tabs by hovering your hands over the laptop. \
        Uses the doppler effect of audio feedback on hand hovement over the laptop keyboard.",
        url:{
            name:"GitHub",
            url: "https://github.com/icechen1/Swipler"},
        source_url:{
          name:"Source",
          url: "https://github.com/icechen1/Swipler"
        }, 
        type: "web",
        tech: "Chrome extension",
        date:"June 2015"
    }, {
        name: "Ideagen",
        description: "Generate ideas like they do at Apple!",
        url:{
            name:"Webapp",
            url: "/ideagen"
        },
        source_url:{
          name:"Source",
          url: "https://github.com/icechen1/ideagen"
        },
        type: "web",
        tech: "Vue.js",
        date:"February 2016"
    }, {
        name: "Roomi",
        description: "Roomi is a communication hub app for roomates built in 20 hours at UW EngHack W15. Won 2nd place at EngHack W15.",
        url:{
            name:"Webapp",
            url: "https://roomi.meteor.com/"},
        source_url: null,
        type: "web",
        tech: "Meteor",
        date:"March 2015"
    }, {
        name: "CommuniVoice",
        description: "A community issue reporting tool for Android. Won the Yelp best Community hack prize at HackIllinois 2015.",
        url:{
            name:"Webapp",
            url: "http://communivoice.azurewebsites.net/"},
        source_url: null,
        type: "android",
        tech: "Android",
        date:"March 2015"
    }, {
        name: "SpeedRun",
        description: "Won 2nd place software hack at UofTHacks for the SpeedRun Android/Pebble fitness game.",
        url:{
            name:"Landing Page",
            url: "http://yuchenhou.com/speedrun/"},
        source_url: null,
        type: "android",
        tech: "Android",
        date:"January 2015"
    }, {
        name: "Unsentletters",
        description: "A little website to display random letters from reddit.com/r/unsentletters.",
        url:{
            name:"Webapp",
            url: "http://Unsentletters.herokuapp.com/"},
        type: "web",
        tech: "Python Flask",
        date: "October 2014"
    }]
  }
});
