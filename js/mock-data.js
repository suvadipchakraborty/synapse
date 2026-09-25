// Fallback dataset — activates automatically when the OpenAlex API is
// unreachable. Shaped exactly like a normalized OpenAlex /topics response
// so the rest of the app can't tell the difference.

function topic(id, name, domain, field, subfield, desc, works, cites, siblingIds) {
  return {
    id: `mock:${id}`,
    display_name: name,
    description: desc,
    domain: { display_name: domain },
    field: { display_name: field },
    subfield: { display_name: subfield },
    works_count: works,
    cited_by_count: cites,
    siblings: siblingIds,
  };
}

export const MOCK_TOPICS = {
  // ---------- Cluster 1: Generative AI ----------
  "genai": topic("genai", "Generative Artificial Intelligence", "Physical Sciences", "Computer Science", "Artificial Intelligence",
    "Models and systems capable of producing novel text, images, audio, and code by learning the statistical structure of large training corpora.",
    18420, 96500, ["mock:llm", "mock:diffusion", "mock:rlhf", "mock:multimodal"]),
  "llm": topic("llm", "Large Language Models", "Physical Sciences", "Computer Science", "Natural Language Processing",
    "Transformer-based neural networks trained on massive text corpora to predict and generate coherent language.",
    9210, 51200, ["mock:genai", "mock:rlhf", "mock:multimodal"]),
  "diffusion": topic("diffusion", "Diffusion Models", "Physical Sciences", "Computer Science", "Computer Vision",
    "Generative models that learn to reverse a gradual noising process to synthesize high-fidelity images and video.",
    4870, 22300, ["mock:genai", "mock:multimodal"]),
  "rlhf": topic("rlhf", "Reinforcement Learning from Human Feedback", "Physical Sciences", "Computer Science", "Machine Learning",
    "A training paradigm that aligns model behavior with human preferences using reward models derived from ranked comparisons.",
    1560, 8900, ["mock:genai", "mock:llm"]),
  "multimodal": topic("multimodal", "Multimodal Learning", "Physical Sciences", "Computer Science", "Artificial Intelligence",
    "Systems that jointly reason over text, image, audio and other modalities within a shared representation space.",
    3320, 15600, ["mock:genai", "mock:llm", "mock:diffusion"]),

  // ---------- Cluster 2: Quantum Teleportation ----------
  "qtel": topic("qtel", "Quantum Teleportation", "Physical Sciences", "Physics and Astronomy", "Quantum Information",
    "The transfer of an unknown quantum state between distant particles using entanglement and classical communication.",
    6210, 84200, ["mock:entanglement", "mock:qcomp", "mock:qcrypto", "mock:qerror"]),
  "entanglement": topic("entanglement", "Quantum Entanglement", "Physical Sciences", "Physics and Astronomy", "Quantum Mechanics",
    "A correlation between quantum particles such that the state of one cannot be described independently of the other, regardless of distance.",
    14300, 210500, ["mock:qtel", "mock:qcrypto"]),
  "qcomp": topic("qcomp", "Quantum Computing", "Physical Sciences", "Computer Science", "Quantum Information",
    "Computation that exploits superposition and entanglement to perform certain calculations exponentially faster than classical machines.",
    21400, 187300, ["mock:qtel", "mock:qerror"]),
  "qcrypto": topic("qcrypto", "Quantum Cryptography", "Physical Sciences", "Physics and Astronomy", "Quantum Information",
    "Cryptographic protocols, such as quantum key distribution, whose security is guaranteed by the laws of quantum mechanics.",
    3980, 41200, ["mock:qtel", "mock:entanglement"]),
  "qerror": topic("qerror", "Quantum Error Correction", "Physical Sciences", "Physics and Astronomy", "Quantum Information",
    "Techniques for protecting fragile quantum information from decoherence and noise using redundant encodings.",
    5100, 39800, ["mock:qtel", "mock:qcomp"]),

  // ---------- Cluster 3: Behavioral Economics ----------
  "bec": topic("bec", "Behavioral Economics", "Social Sciences", "Economics, Econometrics and Finance", "Economics and Econometrics",
    "The study of how psychological, cognitive and emotional factors shape economic decision-making, often departing from rational-agent models.",
    12800, 198400, ["mock:nudge", "mock:prospect", "mock:heuristics", "mock:bias"]),
  "nudge": topic("nudge", "Nudge Theory", "Social Sciences", "Economics, Econometrics and Finance", "Behavioral Economics",
    "The design of subtle choice architecture that steers decisions without restricting options or altering incentives.",
    2340, 46700, ["mock:bec", "mock:heuristics"]),
  "prospect": topic("prospect", "Prospect Theory", "Social Sciences", "Psychology", "Cognitive Psychology",
    "A descriptive model of decision-making under risk in which people evaluate outcomes as gains or losses relative to a reference point.",
    4210, 88900, ["mock:bec", "mock:bias"]),
  "heuristics": topic("heuristics", "Heuristics and Biases", "Social Sciences", "Psychology", "Cognitive Psychology",
    "Mental shortcuts that simplify judgment under uncertainty, sometimes producing systematic and predictable errors.",
    5670, 102300, ["mock:bec", "mock:nudge", "mock:prospect", "mock:bias"]),
  "bias": topic("bias", "Cognitive Bias", "Social Sciences", "Psychology", "Cognitive Psychology",
    "Systematic patterns of deviation from rationality in judgment, often arising from the brain's use of heuristics.",
    7890, 134500, ["mock:bec", "mock:prospect", "mock:heuristics"]),

  // ---------- Cluster 4: CRISPR Gene Editing ----------
  "crispr": topic("crispr", "CRISPR Gene Editing", "Life Sciences", "Biochemistry, Genetics and Molecular Biology", "Genetics",
    "A programmable genome-editing technology derived from a bacterial immune system, using guide RNA to direct precise DNA cuts.",
    16700, 312000, ["mock:cas9", "mock:geneTherapy", "mock:epigenetics", "mock:synbio"]),
  "cas9": topic("cas9", "Cas9 Endonuclease", "Life Sciences", "Biochemistry, Genetics and Molecular Biology", "Molecular Biology",
    "The RNA-guided enzyme that performs the double-strand DNA cleavage central to most CRISPR editing systems.",
    5230, 96800, ["mock:crispr", "mock:synbio"]),
  "geneTherapy": topic("geneTherapy", "Gene Therapy", "Life Sciences", "Medicine", "Genetics (clinical)",
    "Clinical approaches that correct or replace defective genes to treat or prevent inherited and acquired disease.",
    9840, 176300, ["mock:crispr", "mock:epigenetics"]),
  "epigenetics": topic("epigenetics", "Epigenetics", "Life Sciences", "Biochemistry, Genetics and Molecular Biology", "Genetics",
    "The study of heritable changes in gene expression that occur without alterations to the underlying DNA sequence.",
    11200, 201400, ["mock:crispr", "mock:geneTherapy"]),
  "synbio": topic("synbio", "Synthetic Biology", "Life Sciences", "Biochemistry, Genetics and Molecular Biology", "Bioengineering",
    "An engineering discipline that designs and constructs novel biological parts, devices and systems for useful purposes.",
    7460, 118900, ["mock:crispr", "mock:cas9"]),
};

export const SEED_SPARKS = [
  { label: "Generative AI", id: "mock:genai" },
  { label: "Quantum Teleportation", id: "mock:qtel" },
  { label: "Behavioral Economics", id: "mock:bec" },
  { label: "CRISPR Gene Editing", id: "mock:crispr" },
  { label: "Neuroplasticity", query: "neuroplasticity" },
  { label: "Algorithmic Game Theory", query: "algorithmic game theory" },
  { label: "Nuclear Fusion", query: "nuclear fusion" },
  { label: "Agentic AI", query: "agentic ai" },
];

export function mockSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.values(MOCK_TOPICS)
    .filter(t => t.display_name.toLowerCase().includes(q))
    .slice(0, 8);
}

export function mockGet(id) {
  return MOCK_TOPICS[id] || Object.values(MOCK_TOPICS).find(t => t.id === id) || null;
}

export function mockRandom() {
  const keys = Object.keys(MOCK_TOPICS);
  const key = keys[Math.floor(Math.random() * keys.length)];
  return MOCK_TOPICS[key];
}
