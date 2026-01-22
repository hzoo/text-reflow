export const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'but',
  'by',
  'do',
  'does',
  'for',
  'from',
  'has',
  'have',
  'he',
  'her',
  'him',
  'his',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'more',
  'my',
  'not',
  'of',
  'on',
  'or',
  'our',
  'out',
  'she',
  'since',
  'so',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'too',
  'we',
  'what',
  'when',
  'where',
  'which',
  'who',
  'will',
  'with',
  'would',
  'you',
])

export const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'no', 'fig', 'figs', 'dept', 'inc', 'ltd', 'co',
  'e.g', 'i.e', 'etc', 'vs', 'al', 'ed', 'rev', 'eq', 'eqs', 'sec', 'secs',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
])

export const SAMPLE_TEXTS = {
  engelbart: 'By "augmenting human intellect" we mean increasing the capability of a man to approach a complex problem situation, to gain comprehension to suit his particular needs, and to derive solutions to problems. Increased capability in this respect is taken to mean a mixture of the following: more-rapid comprehension, better comprehension, the possibility of gaining a useful degree of comprehension in a situation that previously was too complex, speedier solutions, better solutions, and the possibility of finding solutions to problems that before seemed insoluble. And by "complex situations" we include the professional problems of diplomats, executives, social scientists, life scientists, physical scientists, attorneys, designers—whether the problem situation exists for twenty minutes or twenty years. We do not speak of isolated clever tricks that help in particular situations. We refer to a way of life in an integrated domain where hunches, cut-and-try, intangibles, and the human "feel for a situation" usefully co-exist with powerful concepts, streamlined terminology and notation, sophisticated methods, and high-powered electronic aids.',

  kafka: 'One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin. He lay on his armour-like back, and if he lifted his head a little he could see his brown belly, slightly domed and divided by arches into stiff sections. The bedding was hardly able to cover it and seemed ready to slide off any moment. His many legs, pitifully thin compared with the size of the rest of him, waved about helplessly as he looked.',

  tufte: 'Clutter and confusion are not attributes of data – they are shortcomings of design. The issue is the quality of the design, not the quantity of the data. Escaping this flatland is the essential task of envisioning information – for all the interesting worlds that we seek to understand are inevitably and happily multivariate in nature. Not flatlands.',

  orwell: 'It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him.',

  short: 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.',

  john5: `Testimonies About Jesus
31 "If I testify about myself, my testimony is not true. 32 There is another who testifies in my favor, and I know that his testimony about me is true.

33 "You have sent to John and he has testified to the truth. 34 Not that I accept human testimony; but I mention it that you may be saved. 35 John was a lamp that burned and gave light, and you chose for a time to enjoy his light.

36 "I have testimony weightier than that of John. For the works that the Father has given me to finish—the very works that I am doing—testify that the Father has sent me. 37 And the Father who sent me has himself testified concerning me. You have never heard his voice nor seen his form, 38 nor does his word dwell in you, for you do not believe the one he sent. 39 You study the Scriptures diligently because you think that in them you have eternal life. These are the very Scriptures that testify about me, 40 yet you refuse to come to me to have life.

41 "I do not accept glory from human beings, 42 but I know you. I know that you do not have the love of God in your hearts. 43 I have come in my Father's name, and you do not accept me; but if someone else comes in his own name, you will accept him. 44 How can you believe since you accept glory from one another but do not seek the glory that comes from the only God?

45 "But do not think I will accuse you before the Father. Your accuser is Moses, on whom your hopes are set. 46 If you believed Moses, you would believe me, for he wrote about me. 47 But since you do not believe what he wrote, how are you going to believe what I say?"`,
}

export const DEFAULT_TEXT = SAMPLE_TEXTS.engelbart
