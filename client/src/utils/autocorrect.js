// Lightweight, fully-local autocorrect. No network, no third-party service.
// Corrects common English typos on word completion (when the user types a
// space or punctuation). Capitalization of the original word is preserved.

const CORRECTIONS = {
  // articles / pronouns / common words
  teh: 'the', thr: 'the', hte: 'the', tht: 'that', taht: 'that', thsi: 'this',
  ti: 'it', si: 'is', waht: 'what', wat: 'what', whta: 'what', wich: 'which',
  yuo: 'you', yu: 'you', youre: "you're", ur: 'your', u: 'you',
  im: "i'm", ive: "i've", ill: "i'll", id: "i'd", cant: "can't", dont: "don't",
  doesnt: "doesn't", didnt: "didn't", wont: "won't", wouldnt: "wouldn't",
  couldnt: "couldn't", shouldnt: "shouldn't", isnt: "isn't", arent: "aren't",
  wasnt: "wasn't", werent: "weren't", hasnt: "hasn't", havent: "haven't",
  hadnt: "hadn't", thats: "that's", whats: "what's", lets: "let's",
  its: "it's", theres: "there's", heres: "here's", whos: "who's",
  // common misspellings
  recieve: 'receive', recieved: 'received', acheive: 'achieve',
  beleive: 'believe', beleived: 'believed', wierd: 'weird', freind: 'friend',
  freinds: 'friends', seperate: 'separate', definately: 'definitely',
  definatly: 'definitely', occured: 'occurred', occuring: 'occurring',
  begining: 'beginning', accross: 'across',
  agressive: 'aggressive', apparant: 'apparent', arguement: 'argument',
  basicly: 'basically', calender: 'calendar', cemetary: 'cemetery',
  changable: 'changeable', commitee: 'committee', concious: 'conscious',
  decieve: 'deceive', dilema: 'dilemma', dissapear: 'disappear',
  dissapoint: 'disappoint', embarass: 'embarrass', enviroment: 'environment',
  existance: 'existence', familar: 'familiar', finaly: 'finally',
  goverment: 'government', gramar: 'grammar', garantee: 'guarantee',
  happend: 'happened', harrass: 'harass', immediatly: 'immediately',
  independant: 'independent', knowlege: 'knowledge', liason: 'liaison',
  libary: 'library', maintainance: 'maintenance', maintenence: 'maintenance',
  millenium: 'millennium', neccessary: 'necessary', necesary: 'necessary',
  noticable: 'noticeable', occassion: 'occasion', occurance: 'occurrence',
  payed: 'paid', percieve: 'perceive', perseverence: 'perseverance',
  posession: 'possession', prefered: 'preferred', priviledge: 'privilege',
  probaly: 'probably', probably: 'probably', proffesional: 'professional',
  promiss: 'promise', pronounciation: 'pronunciation', publically: 'publicly',
  questionaire: 'questionnaire', recomend: 'recommend', refered: 'referred',
  relevent: 'relevant', religous: 'religious', repitition: 'repetition',
  rythm: 'rhythm', secratary: 'secretary', sieze: 'seize', similiar: 'similar',
  succesful: 'successful', successfull: 'successful', supercede: 'supersede',
  suprise: 'surprise', surprize: 'surprise', tendancy: 'tendency',
  threshhold: 'threshold', tommorow: 'tomorrow', tommorrow: 'tomorrow',
  truely: 'truly', unfortunatly: 'unfortunately', untill: 'until',
  wether: 'whether', whereever: 'wherever',
  // texting / chat shorthand expansions (kept conservative)
  pls: 'please', plz: 'please', thnx: 'thanks', thx: 'thanks', ty: 'thanks',
  bcoz: 'because', becuase: 'because', becuse: 'because', coz: 'because',
  ppl: 'people', msg: 'message', tmrw: 'tomorrow', tmw: 'tomorrow',
  abt: 'about', alot: 'a lot', alright: 'all right',
  // common doubles/typos
  adress: 'address', alwasy: 'always', anual: 'annual', appriciate: 'appreciate',
  comming: 'coming', completly: 'completely', differnt: 'different',
  difinietly: 'definitely', eventhough: 'even though', exmaple: 'example',
  experiance: 'experience', febuary: 'february', fourty: 'forty',
  gaurd: 'guard', greatful: 'grateful', havnt: "haven't", lenght: 'length',
  liek: 'like', litle: 'little', mispell: 'misspell', morning: 'morning',
  ofcourse: 'of course', oppurtunity: 'opportunity', persue: 'pursue',
  reccomend: 'recommend', remeber: 'remember', responce: 'response',
  seing: 'seeing', somthing: 'something', somethign: 'something',
  strenght: 'strength', successfuly: 'successfully', thsoe: 'those',
  togehter: 'together', tongiht: 'tonight', tonihgt: 'tonight',
  wnat: 'want', watn: 'want', wnated: 'wanted', writting: 'writing',
  youll: "you'll", youve: "you've"
};

// Match the capitalization of the source word onto the corrected word.
function matchCase(source, corrected) {
  if (source === source.toUpperCase() && source.length > 1) return corrected.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return corrected[0].toUpperCase() + corrected.slice(1);
  return corrected;
}

// Given the full text and the cursor position (caret index), correct the word
// immediately before the caret if it's a known typo. Returns { text, caret }
// or null if no change.
export function autocorrectAtCaret(text, caret) {
  // Look at the substring before the caret
  const before = text.slice(0, caret);
  // Find the last word (letters + apostrophes) right before the caret
  const m = before.match(/([A-Za-z']+)$/);
  if (!m) return null;
  const word = m[1];
  const lower = word.toLowerCase().replace(/^'+|'+$/g, '');
  const fixed = CORRECTIONS[lower];
  if (!fixed) return null;
  const cased = matchCase(word, fixed);
  if (cased === word) return null;
  const start = caret - word.length;
  const newText = text.slice(0, start) + cased + text.slice(caret);
  return { text: newText, caret: start + cased.length };
}
