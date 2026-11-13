"""アーケードの物語テキスト（data/story/<id>.json）"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

S = {}

S["toma"] = {
    "opening": [
        "金沢の小さな町道場「篠宮道場」。父が遺したその看板は、借金とともに灯真の肩に残った。\n届いたのは、環財団からの招待状。世界中の武術家が拳を交える大会「RINGBOUND」——優勝賞金があれば、道場は守れる。\n「親父の一撃必倒じゃない。一手先を読む空手で、俺は勝つ」\n灯真は帯を締め直し、海を渡った。",
        "In Kanazawa stands the small Shinomiya Dojo. When his father died, Toma inherited its sign — and its debts.\nThen came an invitation from the Tamaki Foundation: RINGBOUND, a tournament of the world's martial artists. The prize money could save the dojo.\n\"Not Father's one-strike karate. I'll win by reading one move ahead.\"\nToma tightened his belt and crossed the sea.",
    ],
    "rival": [
        ["ゾー「……また会ったな。お前の拳は真っ直ぐだ」", "Zaw: \"...We meet again. Your fists are honest.\""],
        ["灯真「あんたもな。だからこそ、読み合いで勝つ」", "Toma: \"So are yours. That's why I'll win the mind game.\""],
        ["ゾー「拳で話そう。そのほうが楽だ」", "Zaw: \"Let our fists talk. It's easier.\""],
    ],
    "boss": [
        ["玄斎「ほう、篠宮の倅か。父上の拳は重かったが、読みは浅かった」", "Gensai: \"Ah, Shinomiya's boy. Your father's fist was heavy, but his reading was shallow.\""],
        ["灯真「親父を知ってるのか……！」", "Toma: \"You knew my father...?\""],
        ["玄斎「確かめてみるがいい。その一手、どこまで先に置ける？」", "Gensai: \"See for yourself. How far ahead can you place your move?\""],
    ],
    "ending": [
        "灯台の嵐が去ったあと、玄斎は静かに笑った。「父上は、最後にお前の名を呼んでいたよ。『あいつは俺より先を見る』とな」\n賞金で道場の借金は消えた。だが灯真が持ち帰った一番のものは、財団が記録していた父の組手の映像だった。\n翌朝、篠宮道場の戸が開く。子どもたちの声が響く板の間で、灯真は一礼した。\n「押忍。今日は、一手先を読む稽古からだ」",
        "When the storm over the lighthouse passed, Gensai smiled quietly. \"Your father said your name at the end. 'He sees further than I do,' he told me.\"\nThe prize cleared the dojo's debts. But the greatest thing Toma brought home was the Foundation's footage of his father's matches.\nThe next morning the doors of the Shinomiya Dojo opened. On the wooden floor, filled with children's voices, Toma bowed.\n\"Osu. Today we train to read one move ahead.\"",
    ],
    "win_quotes": [
        ["一手、先に置いておいた", "I placed my move one step ahead."],
        ["押忍。いい組手でした", "Osu. That was a good match."],
        ["まだまだ。親父なら、もっと早く終わらせてた", "Not yet. Father would've finished it faster."],
    ],
}

S["lena"] = {
    "opening": [
        "元要人警護官、レナ・ヴォルコワ。今はフリーの護衛として、危険な依頼だけを選んで受けている。\n今回の依頼主は匿名。内容は「環財団が武術家を集める本当の理由を調べろ」。\n潜入の方法はひとつしかない。選手としてリングに上がることだ。\n「力を抜いて。……仕事はいつも通りよ」",
        "Former VIP bodyguard Lena Volkova now works freelance, taking only the dangerous jobs.\nThis client is anonymous. The task: find out why the Tamaki Foundation really gathers martial artists.\nThere's only one way in — step into the ring as a fighter.\n\"Relax. ...Just another job.\"",
    ],
    "rival": [
        ["アドリアン「マドモワゼル、その歩き方……プロの護衛だね？」", "Adrien: \"Mademoiselle, that walk... a professional bodyguard, yes?\""],
        ["レナ「観察眼は認めるわ。でも、口が軽いのは減点」", "Lena: \"Good eye. Too much talking, though. Points off.\""],
    ],
    "boss": [
        ["玄斎「嗅ぎ回っておるのは、お前さんか」", "Gensai: \"So you're the one who's been sniffing around.\""],
        ["レナ「財団は何を集めているの。武術家の、何を？」", "Lena: \"What is the Foundation collecting? What do they want from fighters?\""],
        ["玄斎「勝てば教えよう。負ければ、それもまた答えじゃ」", "Gensai: \"Win, and I'll tell you. Lose, and that too is an answer.\""],
    ],
    "ending": [
        "玄斎が案内したのは、灯台の地下に広がる書庫だった。世界中の武術の型、組手、口伝——失われかけた技の記録が、静かに眠っていた。\n「財団は、消えゆく武を残すために大会を開いておる。お前さんの依頼主は、それを売り物にしたい連中じゃろう」\nレナは報告書を一枚だけ書いた。『異常なし』。\n帰りの船の上で、彼女は小さく息を吐いた。「……たまには、守る仕事も悪くないわね」",
        "Gensai led her to an archive beneath the lighthouse. Forms, sparring records, oral traditions from martial arts around the world — techniques on the edge of being lost, quietly preserved.\n\"The Foundation holds the tournament to keep vanishing arts alive. Your client likely wants to sell them.\"\nLena wrote a one-line report: 'Nothing unusual.'\nOn the boat home she let out a small breath. \"...Protecting something for once isn't so bad.\"",
    ],
    "win_quotes": [
        ["力を抜いて。……そう、倒れるのが一番楽よ", "Relax. ...Yes, falling down is the easiest part."],
        ["呼吸が乱れてる。それじゃ守れないわ", "Your breathing is a mess. You can't protect anything like that."],
        ["仕事は終わり。請求書は財団に回して", "Job done. Send the invoice to the Foundation."],
    ],
}

S["bjorn"] = {
    "opening": [
        "ロフォーテン諸島の漁師、ビョルン・ハルヴォルセン。かつてはオリンピック候補と呼ばれたレスラーだ。\nあの嵐の夜、彼の漁船「ソールヴァ号」は波にのまれた。仲間は全員救ったが、船は戻らなかった。\n「新しい船がいる。金がいる。なら、組み合えばいい！」\n大きな笑い声とともに、ビョルンは大会への切符を握りしめた。",
        "Bjorn Halvorsen, a fisherman from the Lofoten Islands — once an Olympic hopeful in wrestling.\nOn a stormy night his boat, the Solva, was swallowed by the waves. He saved his whole crew, but the boat never came back.\n\"I need a new boat. I need money. So — let's wrestle!\"\nWith a booming laugh, Bjorn gripped his ticket to the tournament.",
    ],
    "rival": [
        ["アドリアン「やあ、酒場の友よ。今日は飲み比べじゃないぞ」", "Adrien: \"Ah, my friend from the tavern. No drinking contest today.\""],
        ["ビョルン「ハッハ！ 勝ったほうが一杯おごる。いつも通りだ！」", "Bjorn: \"Ha-ha! Loser buys the round. Same as always!\""],
    ],
    "boss": [
        ["玄斎「大きいのう。だが大きいものほど、よく転がる」", "Gensai: \"My, you are big. But the bigger they are, the better they roll.\""],
        ["ビョルン「爺さん、海の上じゃもっと揺れるぞ！」", "Bjorn: \"Old man, the sea rocks a lot harder than this!\""],
    ],
    "ending": [
        "優勝の夜、ビョルンは灯台の食堂で玄斎と大皿のスープを分け合った。「爺さん、あんたの投げは波みたいだった。逆らうと沈む」\n春、ロフォーテンの港に新しい漁船が浮かんだ。舳先に書かれた名は「ソールヴァ二世」。\n進水式で仲間たちに担ぎ上げられたビョルンは、海に向かって叫んだ。\n「さあ行くぞ！ 今度の嵐とも、組み合ってやる！」",
        "On the night of his victory, Bjorn shared a huge bowl of soup with Gensai in the lighthouse kitchen. \"Old man, your throws were like waves. Fight them and you sink.\"\nIn spring a new fishing boat floated in the Lofoten harbor, her bow painted: Solva II.\nHoisted onto his crew's shoulders at the launch, Bjorn roared at the sea.\n\"Let's go! Next storm, I'll wrestle that too!\"",
    ],
    "win_quotes": [
        ["ハッハ！ 海の上じゃ、もっと揺れるぞ！", "Ha-ha! The sea rocks a lot harder than that!"],
        ["いい投げられっぷりだ！ 飯でも食いに行こう！", "You fall like a champion! Let's go eat!"],
        ["網にかかった魚は逃がさないぞ", "Once a fish is in the net, it doesn't get away."],
    ],
}

S["zaw"] = {
    "opening": [
        "マンダレー郊外の村で育ったゾー・ミン。素手で打ち合う拳法ラウェイの使い手だ。\n村の子どもたちは、遠い町の学校まで毎日二時間歩く。村に学校を建てる——それが彼の唯一の願いだった。\n試合の前に、ゾーは伝統の礼を捧げる。拳に巻いた布を確かめ、静かに目を閉じる。\n「……拳で話すほうが、楽だ」",
        "Zaw Min grew up in a village outside Mandalay, a fighter of Lethwei — bare-knuckle boxing.\nThe village children walk two hours every day to a school in a distant town. To build a school in the village: that is his only wish.\nBefore each bout, Zaw performs the traditional salute, checks the wraps on his fists, and quietly closes his eyes.\n\"...It's easier to talk with fists.\"",
    ],
    "rival": [
        ["灯真「ゾー、決勝まで待てなかったな」", "Toma: \"Zaw. Couldn't wait for the final, huh.\""],
        ["ゾー「……いい。お前とは、いつやっても同じだ」", "Zaw: \"...Fine. With you, it's the same whenever we fight.\""],
    ],
    "boss": [
        ["玄斎「素手の拳か。重いが、真っ直ぐすぎる」", "Gensai: \"Bare fists. Heavy — but too straight.\""],
        ["ゾー「真っ直ぐでいい。曲がる理由がない」", "Zaw: \"Straight is enough. I have no reason to bend.\""],
    ],
    "ending": [
        "賞金の使い道を聞かれたゾーは、一言だけ答えた。「学校」。\n一年後、村の真ん中に小さな校舎が建った。開校の日、ゾーは子どもたちの前で伝統の礼を見せた。真似をする小さな手が、いくつも並んだ。\n校舎の壁には、灯真から届いた寄せ書きと、大会の写真が一枚。\nゾーは窓の外の夕日を見て、ほんの少しだけ笑った。",
        "Asked what he would do with the prize, Zaw answered with one word: \"School.\"\nA year later a small schoolhouse stood in the middle of the village. On opening day Zaw showed the children the traditional salute, and rows of small hands copied him.\nOn the wall hung a card signed by Toma, and a single photo from the tournament.\nWatching the sunset through the window, Zaw smiled, just a little.",
    ],
    "win_quotes": [
        ["……拳で話すほうが、楽だ", "...It's easier to talk with fists."],
        ["悪くない拳だった", "Not a bad fist."],
        ["礼を。それで終わりだ", "Bow. Then it's over."],
    ],
}

S["yuelan"] = {
    "opening": [
        "山西省の山あいで、祖母から形意拳を学んだ蘇 月嵐。\n「型は飾りではない。実戦で通じてこそ型だ」——祖母の口癖を証明するため、彼女は大会への出場を決めた。\n出発の前夜、祖母は古い写真を見せた。若き日の祖母が立つリング。その横断幕には、環財団の紋があった。\n「拳は、一直線に」",
        "In the mountains of Shanxi, Su Yuelan learned Xingyiquan from her grandmother.\n\"Forms are not decoration. A form is only a form if it works in a fight\" — to prove her grandmother's words, she entered the tournament.\nThe night before she left, her grandmother showed her an old photo: her younger self standing in a ring beneath a banner bearing the Tamaki Foundation crest.\n\"A fist goes in a straight line.\"",
    ],
    "rival": [
        ["マリエル「わお、ちっちゃい！ でも目が本気だね！」", "Mariel: \"Whoa, tiny! But those eyes mean business!\""],
        ["月嵐「ちっちゃくありません！ ……あ、よろしくお願いします」", "Yuelan: \"I'm not tiny! ...Ah — I mean, nice to meet you.\""],
    ],
    "boss": [
        ["玄斎「その構え……蘇の婆さんの弟子か。懐かしいのう」", "Gensai: \"That stance... you're old Su's student. How nostalgic.\""],
        ["月嵐「祖母を、ご存じなんですか」", "Yuelan: \"You know my grandmother?\""],
        ["玄斎「五十年前、わしを一直線に吹き飛ばした女じゃ」", "Gensai: \"Fifty years ago, she sent me flying in a straight line.\""],
    ],
    "ending": [
        "試合のあと、玄斎は一冊の古い記録帳を月嵐に手渡した。五十年前の大会、祖母の組手が細かく書き留められていた。\n「お前さんの崩拳は、婆さんより半歩速い。伝えておくれ」\n帰郷した月嵐は、記録帳を祖母に渡した。祖母はページをめくり、照れくさそうに笑った。\n「……あの爺、まだ生きてたのかい」\n庭先で、二人の拳が一直線に並んだ。",
        "After the match, Gensai handed Yuelan an old notebook — a detailed record of her grandmother's bouts from the tournament fifty years ago.\n\"Your crushing fist is half a step faster than hers. Tell her that.\"\nBack home, Yuelan gave the notebook to her grandmother, who turned the pages and smiled bashfully.\n\"...So that old man is still alive.\"\nIn the garden, two fists lined up in a single straight line.",
    ],
    "win_quotes": [
        ["拳は、一直線に", "A fist goes in a straight line."],
        ["あ、ありがとうございました！ ……褒めても何も出ませんよ", "Th-thank you very much! ...Praise won't get you anything."],
        ["型は、実戦で通じてこそ型です", "A form is only a form if it works in a fight."],
    ],
}

S["mariel"] = {
    "opening": [
        "セブ島出身のスタントパフォーマー、マリエル・サントス。家族はカリの道場を営んでいる。\nある日届いた映画の主演オファー。条件はひとつ——「RINGBOUND でベスト4に入ること」。\n「最高じゃない！ 道場の宣伝にもなるし、主演も取れる！」\nマリエルはバンダナをきゅっと結び、空港へ駆け出した。",
        "Mariel Santos, a stunt performer from Cebu whose family runs a Kali school.\nOne day an offer arrived: a leading role in a movie. One condition — reach the top four at RINGBOUND.\n\"This is perfect! Great promo for the school, and I get the lead!\"\nMariel tied her bandana tight and dashed for the airport.",
    ],
    "rival": [
        ["アドリアン「おや、共演予定の主演女優じゃないか」", "Adrien: \"Well, if it isn't my future leading lady.\""],
        ["マリエル「カット！ ……え、今のは本番？ じゃあ本気で行くよ！」", "Mariel: \"Cut! ...Wait, is this a real take? Then I'm going all out!\""],
    ],
    "boss": [
        ["玄斎「手が速いのう。だが速い手ほど、取りやすい」", "Gensai: \"Quick hands. But the quicker the hand, the easier to catch.\""],
        ["マリエル「取れるもんなら取ってみて！ スタントは一発勝負なんだから！」", "Mariel: \"Catch me if you can! Stunts are one take only!\""],
    ],
    "ending": [
        "ベスト4どころか、優勝。撮影現場に戻ったマリエルを、スタッフ全員の拍手が迎えた。\n映画のクライマックスは、灯台での一騎打ち。監督は言った。「本物を見た君にしか撮れない場面だ」\n公開初日、セブ島の小さな映画館には家族と道場の生徒たちが詰めかけた。\nスクリーンの中でマリエルが叫ぶ。「カット！ ……え、今のは本番？」\n客席は笑いと歓声で揺れた。",
        "Not just the top four — she won it all. Back on set, the whole crew greeted Mariel with applause.\nThe film's climax became a duel at a lighthouse. \"Only someone who saw the real thing can shoot this scene,\" said the director.\nOn opening day, a small theater in Cebu was packed with her family and the school's students.\nOn screen Mariel shouted, \"Cut! ...Wait, was that a real take?\"\nThe seats shook with laughter and cheers.",
    ],
    "win_quotes": [
        ["カット！ ……え、今のは本番？", "Cut! ...Wait, was that a real take?"],
        ["はい、OKテイク！ お疲れさま！", "That's a wrap! Good work!"],
        ["手数で負けたことはないの。ごめんね！", "I've never lost on hand speed. Sorry!"],
    ],
}

S["adrien"] = {
    "opening": [
        "マルセイユの元消防士、アドリアン・ルフェーヴル。現場で負った脚の怪我が、彼から仕事を奪った。\n医者は言った。「もう前のようには動けない」。\nだが彼の脚は、まだサバットの蹴りを覚えている。賞金は、火災で殉職した同僚の家族へ届けるつもりだ。\n「足元にご注意を、ムッシュ」",
        "Adrien Lefèvre, a former firefighter from Marseille. A leg injury on duty took his job from him.\n\"You'll never move like before,\" the doctor said.\nBut his legs still remember the kicks of Savate. The prize money is meant for the family of a colleague lost in a fire.\n\"Mind your step, monsieur.\"",
    ],
    "rival": [
        ["ビョルン「アドリアン！ 酒場の続きをやろうじゃないか！」", "Bjorn: \"Adrien! Let's finish what we started at the tavern!\""],
        ["アドリアン「いいとも。ただし今日は、僕の脚が先に届く」", "Adrien: \"Gladly. But today, my legs reach first.\""],
    ],
    "boss": [
        ["玄斎「よく伸びる脚じゃ。伸びきった脚は、折れやすいがな」", "Gensai: \"Long legs. Fully extended legs break easily, though.\""],
        ["アドリアン「ご忠告どうも。この脚は一度、炎の中から戻ってきたんでね」", "Adrien: \"Thanks for the advice. These legs have already come back from a fire once.\""],
    ],
    "ending": [
        "賞金の小切手を手に、アドリアンはマルセイユの小さなアパートを訪ねた。扉を開けたのは、殉職した同僚の幼い息子だった。\n「パパの友だち？」\n「そうだよ。君のパパは、誰よりも勇敢だった」\n数か月後、アドリアンは消防学校の格闘訓練の講師として招かれた。新人たちの前で、彼は見事な回し蹴りを披露した。\n「さあ諸君、足元にご注意を」",
        "Check in hand, Adrien visited a small apartment in Marseille. The door was opened by the young son of his fallen colleague.\n\"Are you Papa's friend?\"\n\"I am. Your papa was the bravest of us all.\"\nMonths later Adrien was invited to teach combat training at the fire academy. In front of the recruits he delivered a perfect roundhouse kick.\n\"Now then, everyone — mind your step.\"",
    ],
    "win_quotes": [
        ["足元にご注意を、ムッシュ", "Mind your step, monsieur."],
        ["失礼、少し脚が長すぎたかな", "Pardon me — perhaps my legs were a bit too long."],
        ["この勝利は、炎の中の友に", "This win is for my friend in the flames."],
    ],
}

S["ravi"] = {
    "opening": [
        "ケーララ州でカラリパヤットの道場を開く師範、ラヴィ・ナーヤル。伝統医療にも通じ、弟子たちに慕われている。\n伝統を「見世物」にしてよいのか——招待状を前に彼は迷った。\nだが弟子たちは言った。「先生の技を、世界に見せてください」\n「獅子も、蛇も、象も、ひとつの体の中にいる。……行こう、外の世界へ」",
        "Ravi Nair, master of a Kalaripayattu school in Kerala, versed in traditional medicine and beloved by his students.\nShould tradition become a spectacle? Facing the invitation, he hesitated.\nBut his students said, \"Show the world your art, master.\"\n\"The lion, the serpent and the elephant all live in one body. ...Let us go out into the world.\"",
    ],
    "rival": [
        ["灯真「ラヴィさん。型と実戦、どっちが大事か——答えを聞かせてください」", "Toma: \"Ravi. Forms or real fighting — which matters more? Tell me your answer.\""],
        ["ラヴィ「答えは言葉ではなく、この一戦の中にあるよ」", "Ravi: \"The answer isn't in words. It's inside this match.\""],
    ],
    "boss": [
        ["玄斎「三つの獣を飼う男か。どれが本物の顔かの？」", "Gensai: \"A man who keeps three beasts. Which one is your real face?\""],
        ["ラヴィ「どれも私です。そしてどれも、まだ修行中です」", "Ravi: \"All of them are me. And all of them are still in training.\""],
    ],
    "ending": [
        "大会のあと、ラヴィの道場には世界中から入門の手紙が届いた。その中に、篠宮道場からの一通があった。\n『型と実戦は、ひとつの体の中にある。あなたの言葉の意味が、少しわかった気がします——灯真』\nラヴィは弟子たちを集め、手紙を読み上げた。\n「見世物になるかどうかは、見せる者の心次第だ。さあ、稽古を始めよう」\n夕暮れの道場に、獅子の咆哮のような気合が響いた。",
        "After the tournament, letters asking to join Ravi's school arrived from all over the world. Among them was one from the Shinomiya Dojo.\n'Forms and real fighting live in one body. I think I finally understand what you meant. — Toma'\nRavi gathered his students and read it aloud.\n\"Whether it becomes a spectacle depends on the heart of the one who shows it. Now — let us train.\"\nA shout like a lion's roar echoed through the dojo at dusk.",
    ],
    "win_quotes": [
        ["獅子も、蛇も、象も、ひとつの体の中にいる", "The lion, the serpent and the elephant all live in one body."],
        ["怪我はないかな？ 薬草ならあるよ", "Are you hurt? I have some herbs."],
        ["良い修行になった。ありがとう", "That was good training. Thank you."],
    ],
}

S["gensai"] = {
    "opening": [
        "環財団の相談役、鷹司 玄斎。七十二歳。大会の「最後の壁」として、半世紀にわたり挑戦者を退けてきた。\n今年、彼は初めて自らトーナメントの組み合わせに名を連ねた。\n「若い者の拳を、この身で確かめておきたくなってのう」\n黒い羽織が嵐の風に翻る。老人は静かに、最初の挑戦者を待った。",
        "Gensai Takatsukasa, 72, advisor to the Tamaki Foundation. For half a century he has stood as the tournament's 'last wall.'\nThis year, for the first time, he put his own name into the bracket.\n\"I wanted to feel the young ones' fists with my own body.\"\nHis black haori snapped in the storm wind as the old man quietly awaited his first challenger.",
    ],
    "rival": [
        ["月嵐「あなたが……祖母が話していた方ですね」", "Yuelan: \"You're... the one my grandmother told me about.\""],
        ["玄斎「蘇の孫か。婆さんの崩拳、わしの肋が覚えておるわ」", "Gensai: \"Su's granddaughter. My ribs still remember her crushing fist.\""],
    ],
    "boss": [
        ["玄斎「……己と戦うのは、いつになっても骨が折れる」", "Gensai: \"...Fighting yourself is always tiring, no matter your age.\""],
    ],
    "ending": [
        "大会が終わった夜、玄斎は灯台の書庫で筆を執った。今年の挑戦者たちの技を、ひとつ残らず書き留めるために。\n灯真の読み、ゾーの真っ直ぐな拳、月嵐の崩拳、ビョルンの波のような投げ——。\n「武は、人から人へしか渡らん。だから財団は、場を作り続ける」\n書き終えると、老人は窓の外の海を眺めた。嵐はもう去っていた。\n「さて、来年はどんな若造が来るかのう」",
        "The night the tournament ended, Gensai took up his brush in the lighthouse archive to record every technique of this year's challengers.\nToma's reading, Zaw's straight fists, Yuelan's crushing fist, Bjorn's wave-like throws—\n\"Martial arts pass only from person to person. That's why the Foundation keeps building the stage.\"\nFinished, the old man gazed out at the sea. The storm had already passed.\n\"Now then — what sort of youngsters will come next year?\"",
    ],
    "win_quotes": [
        ["ほう。その一手、どこで覚えた？", "Oh? Where did you learn that move?"],
        ["若いのう。だが悪くない", "So young. But not bad."],
        ["力に逆らわず、流れに乗る。それだけのことよ", "Don't resist the force, ride its flow. That's all there is to it."],
    ],
}


PROFILE = {
    "toma": ("23", ["日本・石川県金沢市", "Kanazawa, Ishikawa, Japan"], "178cm / 76kg", ["実直、負けず嫌い、少し不器用。礼を重んじる。父が遺した町道場を守るために戦う。", "Earnest, competitive and a little clumsy, with deep respect for etiquette. Fights to protect the dojo his father left behind."]),
    "lena": ("27", ["東欧の都市ヴェルスク", "Versk, Eastern Europe"], "168cm / 55kg", ["冷静で皮肉屋、仕事には誠実。呼吸を乱さない元要人警護官。", "Calm, sardonic and dependable. A former VIP bodyguard who never loses her breath."]),
    "bjorn": ("35", ["ノルウェー・ロフォーテン諸島", "Lofoten Islands, Norway"], "196cm / 118kg", ["豪快で陽気、仲間思いの漁師。元オリンピック候補のレスラー。", "A boisterous, warm-hearted fisherman and former Olympic hopeful in wrestling."]),
    "zaw": ("29", ["ミャンマー・マンダレー", "Mandalay, Myanmar"], "172cm / 72kg", ["寡黙で誠実、家族思い。戦いの前後に伝統の礼を欠かさない。", "Quiet, honest and devoted to family. Never skips the traditional salute before and after a fight."]),
    "yuelan": ("20", ["中国・山西省", "Shanxi, China"], "160cm / 50kg", ["生真面目な努力家。褒められると照れる。祖母から形意拳を受け継いだ。", "A serious, hard-working student who gets flustered by praise. Learned Xingyiquan from her grandmother."]),
    "mariel": ("30", ["フィリピン・セブ島", "Cebu, Philippines"], "163cm / 54kg", ["陽気でおしゃべり、面倒見のいいスタントパフォーマー。家族はカリの道場を営む。", "A cheerful, talkative stunt performer who looks after everyone. Her family runs a Kali school."]),
    "adrien": ("32", ["フランス・マルセイユ", "Marseille, France"], "188cm / 82kg", ["洒脱で皮肉と冗談を好むが、責任感の強い元消防士。", "Witty and fond of a joke, but a deeply responsible former firefighter."]),
    "ravi": ("41", ["インド・ケーララ州", "Kerala, India"], "175cm / 70kg", ["穏やかで哲学的、ユーモアのある師範。伝統医療にも通じる。", "A gentle, philosophical master with a sense of humor, also versed in traditional medicine."]),
    "gensai": ("72", ["日本・京都", "Kyoto, Japan"], "165cm / 60kg", ["飄々として慇懃、底知れない老師。環財団の相談役にして大会の「最後の壁」。", "Unflappable, courteous and unfathomable. Advisor to the Tamaki Foundation and the tournament's last wall."]),
}

os.makedirs(os.path.join(ROOT, "data/story"), exist_ok=True)
for cid, d in S.items():
    pr = PROFILE[cid]
    d = {"schema_version": 1, "id": cid, "profile": {"age": pr[0], "origin": pr[1], "size": pr[2], "bio": pr[3]}, **d}
    with open(os.path.join(ROOT, "data/story", cid + ".json"), "w") as fp:
        json.dump(d, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    print(cid, len(d["opening"][0]), len(d["ending"][0]))
