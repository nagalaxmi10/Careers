import re


def _substring_match(req_norm, extracted_all):
    if len(req_norm) < 3:
        return False
    pattern = re.compile(
        r'(?:^|[^a-zA-Z0-9])' + re.escape(req_norm) + r'(?:$|[^a-zA-Z0-9])'
    )
    return any(pattern.search(ext) for ext in extracted_all)


def match_resume(extracted_skills, required_skills):
    if not required_skills:
        return 0.0

    ALIASES = {
        # AI / ML
        "ml":                          "machine learning",
        "ai":                          "artificial intelligence",
        "dl":                          "deep learning",
        "nlp":                         "natural language processing",
        "cv":                          "computer vision",
        "llm":                         "large language model",
        "llms":                        "large language model",
        "genai":                       "generative ai",
        "gen ai":                      "generative ai",
        "rl":                          "reinforcement learning",

        # Frameworks
        "pytorch":                     "deep learning",
        "tensorflow":                  "deep learning",
        "tf":                          "tensorflow",
        "keras":                       "deep learning",
        "scikit-learn":                "machine learning",
        "sklearn":                     "machine learning",
        "huggingface":                 "natural language processing",
        "hugging face":                "natural language processing",
        "transformers":                "natural language processing",
        "langchain":                   "large language model",
        "openai":                      "large language model",
        "spacy":                       "natural language processing",
        "nltk":                        "natural language processing",
        "yolo":                        "computer vision",
        "opencv":                      "computer vision",

        # Web
        "js":                          "javascript",
        "ts":                          "typescript",
        "reactjs":                     "react",
        "react.js":                    "react",
        "vuejs":                       "vue.js",
        "vue":                         "vue.js",
        "nodejs":                      "node.js",
        "node":                        "node.js",
        "nextjs":                      "next.js",
        "next":                        "next.js",
        "expressjs":                   "express.js",
        "express":                     "express.js",
        "dj":                          "django",
        "drf":                         "django",
        "django rest framework":       "django",
        "fastapi":                     "rest apis",
        "flask":                       "rest apis",
        "rest":                        "rest apis",
        "restful":                     "rest apis",

        # HTML/CSS
        "html":                        "html/css",
        "html5":                       "html/css",
        "css":                         "html/css",
        "css3":                        "html/css",

        # Agile
        "scrum":                       "agile methodologies",
        "agile":                       "agile methodologies",
        "kanban":                      "agile methodologies",

        # DevOps / Cloud
        "k8s":                         "kubernetes",
        "aws":                         "amazon web services",
        "gcp":                         "google cloud",
        "google cloud platform":       "google cloud",
        "azure":                       "microsoft azure",
        "ci/cd":                       "devops",
        "github actions":              "ci/cd",
        "jenkins":                     "ci/cd",
        "docker":                      "containerisation",
        "containerization":            "containerisation",

        # Data
        "sql":                         "database",
        "mysql":                       "database",
        "postgresql":                  "database",
        "postgres":                    "postgresql",
        "mongodb":                     "nosql",
        "pandas":                      "data analysis",
        "numpy":                       "data analysis",
        "matplotlib":                  "data visualisation",
        "seaborn":                     "data visualisation",
        "power bi":                    "data visualisation",
        "tableau":                     "data visualisation",

        # Languages
        "py":                          "python",
        "cpp":                         "c++",
        "c plus plus":                 "c++",
        "golang":                      "go",

        # Other
        "oop":                         "object oriented programming",
        "github":                      "git",
        # Finance
"tally":                "erp systems",
"tally erp":            "erp systems",
"accounting":           "financial analysis",
"accounts payable":     "accounts payable/receivable",
"accounts receivable":  "accounts payable/receivable",
"gst":                  "tax analysis",
"bookkeeping":          "general ledger",
"ms excel":             "ms excel (advanced)",
"excel":                "ms excel (advanced)",
"power bi":             "data analysis",
"mis":                  "mis reporting",
"p&l":                  "profit & loss analysis",
"profit and loss":      "profit & loss analysis",
    }

    REVERSE_ALIASES = {}
    for abbr, full in ALIASES.items():
        if full not in REVERSE_ALIASES:
            REVERSE_ALIASES[full] = []
        REVERSE_ALIASES[full].append(abbr)

    def normalise(skill):
        s = skill.lower().strip()
        s = re.sub(r'^[•\-\*]\s*', '', s).strip()
        return ALIASES.get(s, s)

    def all_forms(skill):
        norm  = normalise(skill)
        forms = {norm, skill.lower().strip()}
        for f in REVERSE_ALIASES.get(norm, []):
            forms.add(f)
        if skill.lower().strip() in ALIASES:
            forms.add(ALIASES[skill.lower().strip()])
        return forms

    def word_overlap(a, b):
        stop   = {"and", "or", "of", "the", "a", "an", "in", "for", "with"}
        words_a = set(a.split()) - stop
        words_b = set(b.split()) - stop
        return len(words_a & words_b) >= 2

    extracted_all = set()
    for s in extracted_skills:
        extracted_all.update(all_forms(s))

    matched   = []
    unmatched = []

    for req in required_skills:
        # ✅ FIX: Split compound requirements like "accounts payable/receivable" 
        # or "html/css" into separate parts so they match individually
        req_parts = re.split(r'\s*[/&]\s*', req)
        
        req_matched = False
        for part in req_parts:
            part = part.strip()
            if not part:
                continue
                
            req_forms = all_forms(part)
            req_norm  = normalise(part)

            # 1. Exact alias match
            if req_forms & extracted_all:
                req_matched = True
                break
            # 2. Substring match (e.g., "python" inside "python developer")
            if _substring_match(req_norm, extracted_all):
                req_matched = True
                break
            # 3. Substring match on any alias form
            if any(_substring_match(rf, extracted_all) for rf in req_forms):
                req_matched = True
                break
            # 4. Word overlap (e.g., "ms excel (advanced)" vs "ms excel")
            if any(word_overlap(req_norm, ext) for ext in extracted_all):
                req_matched = True
                break

        if req_matched:
            matched.append(req)
        else:
            unmatched.append(req)

    score = round((len(matched) / len(required_skills)) * 100, 2)

    print(f"=== SKILL MATCH ===")
    print(f"Required:  {required_skills}")
    print(f"Extracted: {extracted_skills}")
    print(f"Matched:   {matched}")
    print(f"Missed:    {unmatched}")
    print(f"Score:     {score}%")

    return score