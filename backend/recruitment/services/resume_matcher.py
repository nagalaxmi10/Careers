import re


def _substring_match(req_norm, extracted_all):
    """
    Only allow substring matching when the required skill is at least 3 chars
    AND the match is at a word boundary (start of string or non-alphanumeric char).
    Prevents "c" matching "c++" or "r" matching "react".
    """
    if len(req_norm) < 3:
        return False

    # Match word boundaries (non-alphanumeric or start/end of string)
    pattern = re.compile(
        r'(?:^|[^a-zA-Z0-9])' + re.escape(req_norm) + r'(?:$|[^a-zA-Z0-9])'
    )
    return any(pattern.search(ext) for ext in extracted_all)


def match_resume(extracted_skills, required_skills):
    """
    Compute what percentage of required skills are covered by extracted skills.

    Matching strategy (in order):
    1. Exact match after normalisation
    2. Alias expansion (ml → machine learning, etc.)
    3. Substring containment (with word boundaries for short skills)
    4. Word-level overlap — if 2+ words of a multi-word skill match, count it
    """
    if not required_skills:
        return 0.0

    # FIX: Unidirectional mapping to ONE canonical form.
    # All abbreviations map to their full long-form equivalent.
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

        # Frameworks that imply a domain
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
        "graphql":                     "graphql",

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
        "mongodb":                     "nosql",          # FIX: One-directional. MongoDB implies NoSQL, but NoSQL doesn't imply MongoDB.
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
        "git":                         "version control",
        "github":                      "version control",
        "scrum":                       "agile",          # FIX: One-directional. Scrum implies Agile, but Agile doesn't imply Scrum.
    }

    # Auto-generate reverse alias map so "deep learning" matches "pytorch"
    REVERSE_ALIASES = {}
    for abbr, full in ALIASES.items():
        if full not in REVERSE_ALIASES:
            REVERSE_ALIASES[full] = []
        REVERSE_ALIASES[full].append(abbr)

    def normalise(skill):
        s = skill.lower().strip()
        # ✅ NEW: Strip leading bullet points/dashes that might survive parsing
        s = re.sub(r'^[•\-\*]\s*', '', s).strip()
        return ALIASES.get(s, s)

    def all_forms(skill):
        """Return all known equivalent forms of a skill."""
        norm = normalise(skill)
        forms = {norm, skill.lower().strip()}
        # add any reverse aliases
        for f in REVERSE_ALIASES.get(norm, []):
            forms.add(f)
        # add the original alias target too
        if skill.lower().strip() in ALIASES:
            forms.add(ALIASES[skill.lower().strip()])
        return forms

    def word_overlap(a, b):
        """True if 2+ meaningful words overlap between two skill strings."""
        stop = {"and", "or", "of", "the", "a", "an", "in", "for", "with"}
        words_a = set(a.split()) - stop
        words_b = set(b.split()) - stop
        return len(words_a & words_b) >= 2

    extracted_norm = [normalise(s) for s in extracted_skills]
    extracted_all  = set()
    for s in extracted_skills:
        extracted_all.update(all_forms(s))

    matched = []
    unmatched = []

    for req in required_skills:
        req_forms = all_forms(req)
        req_norm  = normalise(req)

        # 1. Any form of required skill exactly matches any form of extracted skill
        if req_forms & extracted_all:
            matched.append(req)
            continue

        # 2. Substring: check safely using word boundaries to avoid "c" matching "c++"
        if _substring_match(req_norm, extracted_all):
            matched.append(req)
            continue

        # 3. Substring reverse: any required form is contained in an extracted skill (with boundary check)
        if any(_substring_match(rf, extracted_all) for rf in req_forms):
            matched.append(req)
            continue

        # 4. Word-level overlap for multi-word skills
        if any(word_overlap(req_norm, ext) for ext in extracted_all):
            matched.append(req)
            continue

        unmatched.append(req)

    score = round((len(matched) / len(required_skills)) * 100, 2)

    print(f"=== SKILL MATCH ===")
    print(f"Required:  {required_skills}")
    print(f"Extracted: {extracted_skills}")
    print(f"Matched:   {matched}")
    print(f"Missed:    {unmatched}")
    print(f"Score:     {score}%")

    return score