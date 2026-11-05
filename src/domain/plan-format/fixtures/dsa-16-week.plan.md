# Data structures and algorithms in 16 weeks

Dev test data for Kiln, converted from `dsa-study-tracker-spec.md` (16-week DSA plan). Auto mode: no calendar dates; each week is a module held back with `notBeforeDay`, so week N starts no earlier than plan day 7(N-1)+1. Day numbers from the source appear in task descriptions.

Phase 1: Foundations and linear data structures (weeks 1-3). Phase 2: Searching, hash tables and trees (weeks 4-7). Phase 3: Priority queues, graphs and disjoint sets (weeks 8-11). Phase 4: Dynamic programming, advanced topics and mock prep (weeks 12-16).

```json
{
  "schemaVersion": 1,
  "id": "dsa-16-week",
  "title": "Data structures and algorithms in 16 weeks",
  "description": "A 16-week path from complexity analysis and linear structures to dynamic programming and timed mock interviews, with LeetCode problems throughout.",
  "goal": "Be ready for coding interviews at top tech companies",
  "subject": "Data structures and algorithms",
  "level": "beginner",
  "audience": "Learner moving from software engineering fundamentals to coding-interview readiness",
  "schedulingMode": "auto",
  "sources": [
    {
      "id": "fiset-course",
      "title": "Data Structures Easy to Advanced Course (freeCodeCamp)",
      "kind": "video"
    },
    {
      "id": "neetcode-roadmap",
      "title": "Roadmap (roadmap.sh and NeetCode 150)",
      "kind": "course"
    },
    {
      "id": "interview-handbook",
      "title": "Technical Interview Guide for Busy Engineers (Tech Interview Handbook, Grind 75)",
      "kind": "article",
      "url": "https://www.techinterviewhandbook.org/grind75/"
    },
    {
      "id": "visualgo",
      "title": "VisuAlgo Interactive Visualizer",
      "kind": "visualizer",
      "url": "https://visualgo.net/en"
    }
  ],
  "dailyPractice": {
    "source": "plan",
    "perDay": 1,
    "startDifficulty": "easy",
    "topicFollowsLessons": true
  },
  "modules": [
    {
      "id": "week-01-complexity-memory",
      "title": "Week 1: Complexity analysis and memory layouts",
      "order": 1,
      "summary": "Phase 1: Foundations and linear data structures (weeks 1-3).",
      "notBeforeDay": 1
    },
    {
      "id": "week-02-linked-lists",
      "title": "Week 2: Linked lists and beginning LeetCode",
      "order": 2,
      "summary": "Phase 1: Foundations and linear data structures (weeks 1-3).",
      "notBeforeDay": 8
    },
    {
      "id": "week-03-stacks-queues",
      "title": "Week 3: Stacks and queues",
      "order": 3,
      "summary": "Phase 1: Foundations and linear data structures (weeks 1-3).",
      "notBeforeDay": 15
    },
    {
      "id": "week-04-binary-search-windows",
      "title": "Week 4: Binary search and two-pointer patterns",
      "order": 4,
      "summary": "Phase 2: Searching, hash tables and trees (weeks 4-7).",
      "notBeforeDay": 22
    },
    {
      "id": "week-05-hash-tables",
      "title": "Week 5: Hash tables and collision resolution",
      "order": 5,
      "summary": "Phase 2: Searching, hash tables and trees (weeks 4-7).",
      "notBeforeDay": 29
    },
    {
      "id": "week-06-binary-trees",
      "title": "Week 6: Binary trees and tree traversals",
      "order": 6,
      "summary": "Phase 2: Searching, hash tables and trees (weeks 4-7).",
      "notBeforeDay": 36
    },
    {
      "id": "week-07-bst-patterns",
      "title": "Week 7: Advanced BST operations and tree patterns",
      "order": 7,
      "summary": "Phase 2: Searching, hash tables and trees (weeks 4-7).",
      "notBeforeDay": 43
    },
    {
      "id": "week-08-heaps",
      "title": "Week 8: Heaps and priority queues",
      "order": 8,
      "summary": "Phase 3: Priority queues, graphs and disjoint sets (weeks 8-11).",
      "notBeforeDay": 50
    },
    {
      "id": "week-09-backtracking",
      "title": "Week 9: Backtracking and combination search",
      "order": 9,
      "summary": "Phase 3: Priority queues, graphs and disjoint sets (weeks 8-11).",
      "notBeforeDay": 57
    },
    {
      "id": "week-10-union-find-graphs",
      "title": "Week 10: Disjoint sets (union-find) and graph traversals",
      "order": 10,
      "summary": "Phase 3: Priority queues, graphs and disjoint sets (weeks 8-11).",
      "notBeforeDay": 64
    },
    {
      "id": "week-11-topological-shortest-paths",
      "title": "Week 11: Topological sort and shortest paths",
      "order": 11,
      "summary": "Phase 3: Priority queues, graphs and disjoint sets (weeks 8-11).",
      "notBeforeDay": 71
    },
    {
      "id": "week-12-dp-1d",
      "title": "Week 12: 1D dynamic programming",
      "order": 12,
      "summary": "Phase 4: Dynamic programming, advanced topics and mock prep (weeks 12-16).",
      "notBeforeDay": 78
    },
    {
      "id": "week-13-dp-2d",
      "title": "Week 13: 2D dynamic programming and grid DP",
      "order": 13,
      "summary": "Phase 4: Dynamic programming, advanced topics and mock prep (weeks 12-16).",
      "notBeforeDay": 85
    },
    {
      "id": "week-14-intervals-greedy-bits",
      "title": "Week 14: Intervals, greedy and bit manipulation",
      "order": 14,
      "summary": "Phase 4: Dynamic programming, advanced topics and mock prep (weeks 12-16).",
      "notBeforeDay": 92
    },
    {
      "id": "week-15-timed-mocks",
      "title": "Week 15: Timed mock practice",
      "order": 15,
      "summary": "Phase 4: Dynamic programming, advanced topics and mock prep (weeks 12-16).",
      "notBeforeDay": 99
    },
    {
      "id": "week-16-interview-readiness",
      "title": "Week 16: Interview readiness",
      "order": 16,
      "summary": "Phase 4: Dynamic programming, advanced topics and mock prep (weeks 12-16).",
      "notBeforeDay": 106
    }
  ],
  "tasks": [
    {
      "id": "big-o-time-complexity",
      "moduleId": "week-01-complexity-memory",
      "order": 1,
      "title": "Big-O time complexity",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "complexity-analysis"
      ],
      "description": "Day 1. Definition of worst-case complexity, asymptotic upper bounds, and dominant terms.",
      "objectives": [
        "Explain worst-case complexity and asymptotic upper bounds",
        "Pick the dominant term of an expression"
      ],
      "verificationQuestions": [
        "Why is running time described by its worst case and its dominant term?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Big-O time complexity",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "space-complexity-constants",
      "moduleId": "week-01-complexity-memory",
      "order": 2,
      "title": "Space complexity and constants",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "complexity-analysis"
      ],
      "description": "Day 2. Auxiliary space analysis, dropping additive/multiplicative constants, and in-place memory considerations.",
      "objectives": [
        "Separate auxiliary space from input size",
        "Drop constants correctly and recognise an in-place algorithm"
      ],
      "verificationQuestions": [
        "When is an algorithm in place, and why are constants dropped?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Space complexity and constants",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "static-arrays",
      "moduleId": "week-01-complexity-memory",
      "order": 3,
      "title": "Static arrays",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 3. Contiguous memory allocation, O(1) indexing, O(n) search, and cache locality.",
      "objectives": [
        "Explain why indexing a static array is O(1)",
        "Describe how contiguous memory helps cache locality"
      ],
      "verificationQuestions": [
        "Why is searching an unsorted array O(n) while indexing is O(1)?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Static arrays",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "dynamic-arrays",
      "moduleId": "week-01-complexity-memory",
      "order": 4,
      "title": "Dynamic arrays",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 4. Amortized O(1) append operations, capacity doubling mechanics, and reallocation overhead.",
      "objectives": [
        "Explain why append is amortized O(1)",
        "Describe what happens when capacity doubles"
      ],
      "verificationQuestions": [
        "Why is a single append sometimes O(n) yet O(1) amortized?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Dynamic arrays",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "dynamic-array-implementation",
      "moduleId": "week-01-complexity-memory",
      "order": 5,
      "title": "Dynamic array implementation",
      "type": "lesson",
      "estimatedMinutes": 60,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 5. Code walkthrough of custom dynamic array with resize and bounds check.",
      "objectives": [
        "Implement a dynamic array with resize",
        "Add bounds checking to get and set"
      ],
      "verificationQuestions": [
        "Which operations of your implementation trigger a resize, and what do they cost?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Dynamic array implementation",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": [
        "dynamic-arrays"
      ]
    },
    {
      "id": "visualgo-arrays",
      "moduleId": "week-01-complexity-memory",
      "order": 6,
      "title": "Visualizer and cheatsheet review",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 6. Animate array operations on VisuAlgo (visualgo.net/en/array).",
      "resources": [
        {
          "title": "VisuAlgo: array",
          "url": "https://visualgo.net/en/array",
          "kind": "visualizer",
          "minutes": 15,
          "sourceId": "visualgo"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "week-1-review",
      "moduleId": "week-01-complexity-memory",
      "order": 7,
      "title": "Week 1 review",
      "type": "review",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "complexity-analysis",
        "arrays-hashing"
      ],
      "description": "Day 7. Self-assessment quiz on Big-O calculations and dynamic array space bounds.",
      "verificationQuestions": [
        "What is the Big-O of nested loops over n items each?",
        "How much extra space does a dynamic array use at worst?"
      ],
      "dependsOn": []
    },
    {
      "id": "singly-linked-lists",
      "moduleId": "week-02-linked-lists",
      "order": 1,
      "title": "Singly linked lists",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "linked-list"
      ],
      "description": "Day 8. Node structure, head tracking, O(1) prepending, and O(n) traversal.",
      "objectives": [
        "Describe the node structure and head pointer",
        "State the cost of prepend and traversal"
      ],
      "verificationQuestions": [
        "Why is prepend O(1) but access by index O(n)?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Singly linked lists",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "doubly-linked-lists",
      "moduleId": "week-02-linked-lists",
      "order": 2,
      "title": "Doubly linked lists",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "linked-list"
      ],
      "description": "Day 9. Previous/next pointer mechanics, tail tracking, and O(1) tail deletion.",
      "objectives": [
        "Maintain previous and next pointers on insert and delete",
        "Explain why tail deletion becomes O(1)"
      ],
      "verificationQuestions": [
        "What extra bookkeeping does a doubly linked list need on every insert?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Doubly linked lists",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "linked-list-vs-array",
      "moduleId": "week-02-linked-lists",
      "order": 3,
      "title": "Linked list vs array trade-offs",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "linked-list",
        "arrays-hashing"
      ],
      "description": "Day 10. Memory overhead (8-byte pointers), insertion/deletion comparisons.",
      "objectives": [
        "Compare memory overhead of arrays and linked lists",
        "Compare insertion and deletion costs"
      ],
      "tradeoffs": [
        "Linked list: O(1) insert at a known node, pointer overhead per node vs array: O(n) insert, compact and cache friendly"
      ],
      "verificationQuestions": [
        "When would you pick a linked list over a dynamic array?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Linked list vs array trade-offs",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "leetcode-setup-arrays-basics",
      "moduleId": "week-02-linked-lists",
      "order": 4,
      "title": "LeetCode setup and arrays basics",
      "type": "lesson",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 11. Set up LeetCode and your solving workflow, then review the array basics the first problems use.",
      "objectives": [
        "Set up an account and a local solving workflow",
        "Describe a brute-force and a hash map approach to a pair-sum problem"
      ],
      "verificationQuestions": [
        "What is the time and space trade-off of using a hash map to find a pair?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "LeetCode setup and arrays basics",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "two-sum",
      "moduleId": "week-02-linked-lists",
      "order": 5,
      "title": "Two Sum",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 11, LeetCode Setup & Arrays Basics. Solve \"Two Sum\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "two-sum",
        "title": "Two Sum",
        "difficulty": "easy"
      },
      "dependsOn": [
        "leetcode-setup-arrays-basics"
      ]
    },
    {
      "id": "contains-duplicate",
      "moduleId": "week-02-linked-lists",
      "order": 6,
      "title": "Contains Duplicate",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 11, LeetCode Setup & Arrays Basics. Solve \"Contains Duplicate\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "contains-duplicate",
        "title": "Contains Duplicate",
        "difficulty": "easy"
      },
      "dependsOn": [
        "leetcode-setup-arrays-basics"
      ]
    },
    {
      "id": "two-pointers-pattern",
      "moduleId": "week-02-linked-lists",
      "order": 7,
      "title": "Two pointers pattern",
      "type": "lesson",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "two-pointers"
      ],
      "description": "Day 12. Solve Valid Palindrome and Two Sum II with two pointers moving through the input.",
      "objectives": [
        "Recognise problems that fit two pointers",
        "Explain why sorted input allows the pointer moves"
      ],
      "verificationQuestions": [
        "Why does moving the smaller-sum pointer never skip the answer on sorted input?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Two pointers pattern",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "leetcode-setup-arrays-basics"
      ]
    },
    {
      "id": "valid-palindrome",
      "moduleId": "week-02-linked-lists",
      "order": 8,
      "title": "Valid Palindrome",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "two-pointers"
      ],
      "description": "Day 12, Two Pointers Pattern. Solve \"Valid Palindrome\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "valid-palindrome",
        "title": "Valid Palindrome",
        "difficulty": "easy"
      },
      "dependsOn": [
        "two-pointers-pattern"
      ]
    },
    {
      "id": "two-sum-ii-input-array-is-sorted",
      "moduleId": "week-02-linked-lists",
      "order": 9,
      "title": "Two Sum II",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "two-pointers"
      ],
      "description": "Day 12, Two Pointers Pattern. Solve \"Two Sum II\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "two-sum-ii-input-array-is-sorted",
        "title": "Two Sum II",
        "difficulty": "medium"
      },
      "dependsOn": [
        "two-pointers-pattern"
      ]
    },
    {
      "id": "reverse-linked-list",
      "moduleId": "week-02-linked-lists",
      "order": 10,
      "title": "Reverse Linked List",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "linked-list"
      ],
      "description": "Day 13, Linked List Problems. Solve \"Reverse Linked List\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "reverse-linked-list",
        "title": "Reverse Linked List",
        "difficulty": "easy"
      },
      "dependsOn": [
        "doubly-linked-lists"
      ]
    },
    {
      "id": "merge-two-sorted-lists",
      "moduleId": "week-02-linked-lists",
      "order": 11,
      "title": "Merge Two Sorted Lists",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "linked-list"
      ],
      "description": "Day 13, Linked List Problems. Solve \"Merge Two Sorted Lists\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "merge-two-sorted-lists",
        "title": "Merge Two Sorted Lists",
        "difficulty": "easy"
      },
      "dependsOn": [
        "doubly-linked-lists"
      ]
    },
    {
      "id": "visualgo-linked-lists",
      "moduleId": "week-02-linked-lists",
      "order": 12,
      "title": "VisuAlgo drill: linked lists",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "linked-list"
      ],
      "description": "Day 14. Animate linked list insertions/deletions on VisuAlgo (visualgo.net/en/list).",
      "resources": [
        {
          "title": "VisuAlgo: linked list",
          "url": "https://visualgo.net/en/list",
          "kind": "visualizer",
          "minutes": 15,
          "sourceId": "visualgo"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "stack-fundamentals",
      "moduleId": "week-03-stacks-queues",
      "order": 1,
      "title": "Stack fundamentals",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "stack"
      ],
      "description": "Day 15. Last-In, First-Out (LIFO) semantics, push/pop/peek O(1) complexity.",
      "objectives": [
        "Explain LIFO semantics",
        "State the cost of push, pop and peek"
      ],
      "verificationQuestions": [
        "Which real call patterns are naturally last-in, first-out?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Stack fundamentals",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "stack-applications",
      "moduleId": "week-03-stacks-queues",
      "order": 2,
      "title": "Stack applications",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "stack"
      ],
      "description": "Day 16. Call stacks, recursion tracking, matching brackets algorithm.",
      "objectives": [
        "Explain how the call stack tracks recursion",
        "Describe the bracket matching algorithm"
      ],
      "verificationQuestions": [
        "Why does a stack, not a counter, solve mixed bracket matching?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Stack applications",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "queue-fundamentals",
      "moduleId": "week-03-stacks-queues",
      "order": 3,
      "title": "Queue fundamentals",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "queue"
      ],
      "description": "Day 17. First-In, First-Out (FIFO) semantics, enqueue/dequeue operations.",
      "objectives": [
        "Explain FIFO semantics",
        "State the cost of enqueue and dequeue"
      ],
      "verificationQuestions": [
        "Why does a naive array-backed queue make dequeue O(n)?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Queue fundamentals",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "queue-implementations",
      "moduleId": "week-03-stacks-queues",
      "order": 4,
      "title": "Queue implementations",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "queue"
      ],
      "description": "Day 18. Array circular buffers vs. doubly linked list backings.",
      "objectives": [
        "Implement a circular buffer queue",
        "Compare array and linked list backings"
      ],
      "tradeoffs": [
        "Circular buffer: fixed capacity, cache friendly vs doubly linked list: grows freely, pointer overhead"
      ],
      "verificationQuestions": [
        "How does a circular buffer avoid shifting elements?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Queue implementations",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "valid-parentheses",
      "moduleId": "week-03-stacks-queues",
      "order": 5,
      "title": "Valid Parentheses",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "stack"
      ],
      "description": "Day 19, LeetCode Stack Drills. Solve \"Valid Parentheses\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "valid-parentheses",
        "title": "Valid Parentheses",
        "difficulty": "easy"
      },
      "dependsOn": [
        "stack-applications"
      ]
    },
    {
      "id": "min-stack",
      "moduleId": "week-03-stacks-queues",
      "order": 6,
      "title": "Min Stack",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "stack"
      ],
      "description": "Day 19, LeetCode Stack Drills. Solve \"Min Stack\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "min-stack",
        "title": "Min Stack",
        "difficulty": "medium"
      },
      "dependsOn": [
        "stack-applications"
      ]
    },
    {
      "id": "monotonic-stack-pattern",
      "moduleId": "week-03-stacks-queues",
      "order": 7,
      "title": "Monotonic stack pattern",
      "type": "lesson",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "stack"
      ],
      "description": "Day 20. The monotonic stack pattern, applied to the next-warmer-day problem.",
      "objectives": [
        "Recognise next-greater-element problems",
        "Explain why each element is pushed and popped once"
      ],
      "verificationQuestions": [
        "Why is a monotonic stack solution O(n) despite the inner loop?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Monotonic stack pattern",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "stack-applications"
      ]
    },
    {
      "id": "daily-temperatures",
      "moduleId": "week-03-stacks-queues",
      "order": 8,
      "title": "Daily Temperatures",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "stack"
      ],
      "description": "Day 20, Monotonic Stack Pattern. Solve \"Daily Temperatures\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "daily-temperatures",
        "title": "Daily Temperatures",
        "difficulty": "medium"
      },
      "dependsOn": [
        "monotonic-stack-pattern"
      ]
    },
    {
      "id": "evaluate-reverse-polish-notation",
      "moduleId": "week-03-stacks-queues",
      "order": 9,
      "title": "Evaluate Reverse Polish Notation",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "stack"
      ],
      "description": "Day 21, Phase 1 Capstone. Solve \"Evaluate Reverse Polish Notation\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "evaluate-reverse-polish-notation",
        "title": "Evaluate Reverse Polish Notation",
        "difficulty": "medium"
      },
      "dependsOn": [
        "stack-applications"
      ]
    },
    {
      "id": "phase-1-linear-structures-review",
      "moduleId": "week-03-stacks-queues",
      "order": 10,
      "title": "Phase 1 capstone review: linear structures",
      "type": "review",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing",
        "linked-list",
        "stack",
        "queue"
      ],
      "description": "Day 21. Review linear structures: arrays, linked lists, stacks and queues.",
      "verificationQuestions": [
        "Which linear structure fits a bracket matcher, a task queue and an index lookup?",
        "What are the costs of insert at the front for an array and a linked list?"
      ],
      "dependsOn": []
    },
    {
      "id": "binary-search-theory",
      "moduleId": "week-04-binary-search-windows",
      "order": 1,
      "title": "Binary search theory",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "binary-search"
      ],
      "description": "Day 22. Logarithmic range reduction O(log n), lower and upper bound variants.",
      "objectives": [
        "Explain why the search range halves each step",
        "Write lower-bound and upper-bound variants"
      ],
      "verificationQuestions": [
        "How do lower bound and upper bound differ when duplicates exist?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Binary search theory",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "binary-search-rotated-arrays",
      "moduleId": "week-04-binary-search-windows",
      "order": 2,
      "title": "Binary search on rotated arrays",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "binary-search"
      ],
      "description": "Day 23. Handling shifts and identifying sorted halves.",
      "objectives": [
        "Identify which half of a rotated array is sorted",
        "Decide which half can contain the target"
      ],
      "verificationQuestions": [
        "How do you tell which half is sorted after the rotation?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Binary search on rotated arrays",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "sliding-window-fixed",
      "moduleId": "week-04-binary-search-windows",
      "order": 3,
      "title": "Sliding window pattern (fixed size)",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "sliding-window"
      ],
      "description": "Day 24. Window sum and subarray tracking.",
      "objectives": [
        "Maintain a fixed-size window sum in O(n)",
        "Update the window by adding one element and removing one"
      ],
      "verificationQuestions": [
        "Why is a fixed window O(n) rather than O(n*k)?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Sliding window pattern (fixed size)",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "sliding-window-dynamic",
      "moduleId": "week-04-binary-search-windows",
      "order": 4,
      "title": "Sliding window pattern (dynamic size)",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "sliding-window"
      ],
      "description": "Day 25. Two-pointer window expansion and contraction.",
      "objectives": [
        "Expand and contract a window with two pointers",
        "State the invariant the window must keep"
      ],
      "verificationQuestions": [
        "What condition tells you to shrink the window?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Sliding window pattern (dynamic size)",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "sliding-window-fixed"
      ]
    },
    {
      "id": "binary-search",
      "moduleId": "week-04-binary-search-windows",
      "order": 5,
      "title": "Binary Search",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "binary-search"
      ],
      "description": "Day 26, LeetCode Binary Search. Solve \"Binary Search\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "binary-search",
        "title": "Binary Search",
        "difficulty": "easy"
      },
      "dependsOn": [
        "binary-search-theory"
      ]
    },
    {
      "id": "search-in-rotated-sorted-array",
      "moduleId": "week-04-binary-search-windows",
      "order": 6,
      "title": "Search in Rotated Sorted Array",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "binary-search"
      ],
      "description": "Day 26, LeetCode Binary Search. Solve \"Search in Rotated Sorted Array\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "search-in-rotated-sorted-array",
        "title": "Search in Rotated Sorted Array",
        "difficulty": "medium"
      },
      "dependsOn": [
        "binary-search-rotated-arrays"
      ]
    },
    {
      "id": "longest-substring-without-repeating-characters",
      "moduleId": "week-04-binary-search-windows",
      "order": 7,
      "title": "Longest Substring Without Repeating Characters",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "sliding-window"
      ],
      "description": "Day 27, LeetCode Sliding Window. Solve \"Longest Substring Without Repeating Characters\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "longest-substring-without-repeating-characters",
        "title": "Longest Substring Without Repeating Characters",
        "difficulty": "medium"
      },
      "dependsOn": [
        "sliding-window-dynamic"
      ]
    },
    {
      "id": "find-minimum-in-rotated-sorted-array",
      "moduleId": "week-04-binary-search-windows",
      "order": 8,
      "title": "Find Minimum in Rotated Sorted Array",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "binary-search"
      ],
      "description": "Day 28, Weekly Review. Solve \"Find Minimum in Rotated Sorted Array\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "find-minimum-in-rotated-sorted-array",
        "title": "Find Minimum in Rotated Sorted Array",
        "difficulty": "medium"
      },
      "dependsOn": [
        "binary-search-rotated-arrays"
      ]
    },
    {
      "id": "hash-table-core-concepts",
      "moduleId": "week-05-hash-tables",
      "order": 1,
      "title": "Hash table core concepts",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 29. Key-value mapping, deterministic hash functions, O(1) average lookups.",
      "objectives": [
        "Explain how a hash function maps keys to buckets",
        "Explain why lookups are O(1) on average"
      ],
      "verificationQuestions": [
        "Why must a hash function be deterministic?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Hash table core concepts",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "separate-chaining",
      "moduleId": "week-05-hash-tables",
      "order": 2,
      "title": "Separate chaining",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 30. Bucket linked lists, load factor, and dynamic table resizing.",
      "objectives": [
        "Describe bucket lists and the load factor",
        "Explain when and why the table resizes"
      ],
      "verificationQuestions": [
        "Why does a high load factor slow lookups?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Separate chaining",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "open-addressing",
      "moduleId": "week-05-hash-tables",
      "order": 3,
      "title": "Open addressing",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 31. Linear probing, quadratic probing, double hashing, and deletion markers.",
      "objectives": [
        "Compare linear, quadratic and double hashing probes",
        "Explain why deletion needs markers"
      ],
      "tradeoffs": [
        "Separate chaining: simple deletes, extra pointers vs open addressing: compact, clustering and deletion markers"
      ],
      "verificationQuestions": [
        "What breaks if a deleted slot is simply emptied in open addressing?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Open addressing",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "hash-table-applications",
      "moduleId": "week-05-hash-tables",
      "order": 4,
      "title": "Hash table applications",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 32. Frequency counting and lookup optimization.",
      "objectives": [
        "Count frequencies with a hash map",
        "Replace a nested loop with a lookup"
      ],
      "verificationQuestions": [
        "How does a hash map turn an O(n^2) search into O(n)?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Hash table applications",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "group-anagrams",
      "moduleId": "week-05-hash-tables",
      "order": 5,
      "title": "Group Anagrams",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 33, LeetCode Hashing Drills. Solve \"Group Anagrams\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "group-anagrams",
        "title": "Group Anagrams",
        "difficulty": "medium"
      },
      "dependsOn": [
        "hash-table-applications"
      ]
    },
    {
      "id": "top-k-frequent-elements",
      "moduleId": "week-05-hash-tables",
      "order": 6,
      "title": "Top K Frequent Elements",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 33, LeetCode Hashing Drills. Solve \"Top K Frequent Elements\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "top-k-frequent-elements",
        "title": "Top K Frequent Elements",
        "difficulty": "medium"
      },
      "dependsOn": [
        "hash-table-applications"
      ]
    },
    {
      "id": "longest-consecutive-sequence",
      "moduleId": "week-05-hash-tables",
      "order": 7,
      "title": "Longest Consecutive Sequence",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 34, LeetCode Advanced Hashing. Solve \"Longest Consecutive Sequence\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "longest-consecutive-sequence",
        "title": "Longest Consecutive Sequence",
        "difficulty": "medium"
      },
      "dependsOn": [
        "hash-table-applications"
      ]
    },
    {
      "id": "visualgo-hash-tables",
      "moduleId": "week-05-hash-tables",
      "order": 8,
      "title": "VisuAlgo module: hash tables",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "arrays-hashing"
      ],
      "description": "Day 35. Animate open addressing & separate chaining on VisuAlgo (visualgo.net/en/hashtable).",
      "resources": [
        {
          "title": "VisuAlgo: hash table",
          "url": "https://visualgo.net/en/hashtable",
          "kind": "visualizer",
          "minutes": 15,
          "sourceId": "visualgo"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "tree-terminology",
      "moduleId": "week-06-binary-trees",
      "order": 1,
      "title": "Tree terminology",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 36. Root, child, parent, leaf, depth, height, subtrees, and binary invariants.",
      "objectives": [
        "Define root, leaf, depth and height",
        "State the binary tree invariants"
      ],
      "verificationQuestions": [
        "What is the difference between the depth and the height of a node?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Tree terminology",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "tree-dfs-traversals",
      "moduleId": "week-06-binary-trees",
      "order": 2,
      "title": "Depth-first search traversals",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 37. Pre-order (NLR), In-order (LNR), and Post-order (LRN) recursion.",
      "objectives": [
        "Write pre-order, in-order and post-order recursively",
        "Predict the visit order for a small tree"
      ],
      "verificationQuestions": [
        "Which traversal of a BST visits keys in sorted order?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Depth-first search traversals",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "tree-bfs-traversal",
      "moduleId": "week-06-binary-trees",
      "order": 3,
      "title": "Breadth-first search traversal",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees",
        "queue"
      ],
      "description": "Day 38. Level-order traversal using FIFO queues.",
      "objectives": [
        "Run level-order traversal with a queue",
        "Process one level at a time"
      ],
      "verificationQuestions": [
        "Why does BFS need a queue where DFS uses recursion?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Breadth-first search traversal",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "bst-invariant",
      "moduleId": "week-06-binary-trees",
      "order": 4,
      "title": "Binary search tree invariant",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 39. Left < Root < Right property and validation mechanics.",
      "objectives": [
        "State the BST ordering property",
        "Validate a BST with value bounds"
      ],
      "verificationQuestions": [
        "Why is checking only each node against its children not enough to validate a BST?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Binary search tree invariant",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "invert-binary-tree",
      "moduleId": "week-06-binary-trees",
      "order": 5,
      "title": "Invert Binary Tree",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 40, LeetCode Tree Basics. Solve \"Invert Binary Tree\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "invert-binary-tree",
        "title": "Invert Binary Tree",
        "difficulty": "easy"
      },
      "dependsOn": [
        "tree-dfs-traversals"
      ]
    },
    {
      "id": "maximum-depth-of-binary-tree",
      "moduleId": "week-06-binary-trees",
      "order": 6,
      "title": "Maximum Depth of Binary Tree",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 40, LeetCode Tree Basics. Solve \"Maximum Depth of Binary Tree\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "maximum-depth-of-binary-tree",
        "title": "Maximum Depth of Binary Tree",
        "difficulty": "easy"
      },
      "dependsOn": [
        "tree-dfs-traversals"
      ]
    },
    {
      "id": "binary-tree-level-order-traversal",
      "moduleId": "week-06-binary-trees",
      "order": 7,
      "title": "Binary Tree Level Order Traversal",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 41, LeetCode Tree Traversal. Solve \"Binary Tree Level Order Traversal\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "binary-tree-level-order-traversal",
        "title": "Binary Tree Level Order Traversal",
        "difficulty": "medium"
      },
      "dependsOn": [
        "tree-bfs-traversal"
      ]
    },
    {
      "id": "visualgo-bst-recursion",
      "moduleId": "week-06-binary-trees",
      "order": 8,
      "title": "VisuAlgo BST and recursion",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 42. Animate BST operations on VisuAlgo (visualgo.net/en/bst).",
      "resources": [
        {
          "title": "VisuAlgo: binary search tree",
          "url": "https://visualgo.net/en/bst",
          "kind": "visualizer",
          "minutes": 15,
          "sourceId": "visualgo"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "bst-deletion",
      "moduleId": "week-07-bst-patterns",
      "order": 1,
      "title": "BST deletion algorithm",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 43. Handling 0, 1, and 2-child cases using in-order successor/predecessor.",
      "objectives": [
        "Delete a node with zero, one or two children",
        "Choose the in-order successor correctly"
      ],
      "verificationQuestions": [
        "Why is the in-order successor a valid replacement for a deleted node?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "BST deletion algorithm",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": [
        "bst-invariant"
      ]
    },
    {
      "id": "balanced-bst-overview",
      "moduleId": "week-07-bst-patterns",
      "order": 2,
      "title": "Balanced BST overview",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 44. Height balancing (O(log n) bounds) and tree rotation concepts.",
      "objectives": [
        "Explain why balance keeps operations O(log n)",
        "Describe a single rotation"
      ],
      "verificationQuestions": [
        "What happens to BST operations when the tree degenerates into a list?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Balanced BST overview",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": [
        "bst-invariant"
      ]
    },
    {
      "id": "lowest-common-ancestor",
      "moduleId": "week-07-bst-patterns",
      "order": 3,
      "title": "Lowest common ancestor (LCA)",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 45. LCA in BSTs vs. general binary trees.",
      "objectives": [
        "Find the LCA using BST ordering",
        "Find the LCA in a general binary tree"
      ],
      "verificationQuestions": [
        "How does the BST property shortcut the LCA search?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Lowest common ancestor (LCA)",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": [
        "bst-invariant"
      ]
    },
    {
      "id": "tree-construction",
      "moduleId": "week-07-bst-patterns",
      "order": 4,
      "title": "Tree construction problems",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 46. Reconstructing trees from Pre-order and In-order traversals.",
      "objectives": [
        "Rebuild a tree from pre-order and in-order lists",
        "Explain why one traversal alone is ambiguous"
      ],
      "verificationQuestions": [
        "Why do pre-order and in-order together identify a unique tree?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Tree construction problems",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": [
        "tree-dfs-traversals"
      ]
    },
    {
      "id": "validate-binary-search-tree",
      "moduleId": "week-07-bst-patterns",
      "order": 5,
      "title": "Validate Binary Search Tree",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 47, LeetCode BST Drills. Solve \"Validate Binary Search Tree\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "validate-binary-search-tree",
        "title": "Validate Binary Search Tree",
        "difficulty": "medium"
      },
      "dependsOn": [
        "bst-invariant"
      ]
    },
    {
      "id": "kth-smallest-element-in-a-bst",
      "moduleId": "week-07-bst-patterns",
      "order": 6,
      "title": "Kth Smallest Element in a BST",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 47, LeetCode BST Drills. Solve \"Kth Smallest Element in a BST\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "kth-smallest-element-in-a-bst",
        "title": "Kth Smallest Element in a BST",
        "difficulty": "medium"
      },
      "dependsOn": [
        "bst-invariant"
      ]
    },
    {
      "id": "lowest-common-ancestor-of-a-binary-search-tree",
      "moduleId": "week-07-bst-patterns",
      "order": 7,
      "title": "Lowest Common Ancestor of a Binary Search Tree",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 48, LeetCode LCA. Solve \"Lowest Common Ancestor of a Binary Search Tree\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "lowest-common-ancestor-of-a-binary-search-tree",
        "title": "Lowest Common Ancestor of a Binary Search Tree",
        "difficulty": "medium"
      },
      "dependsOn": [
        "lowest-common-ancestor"
      ]
    },
    {
      "id": "serialize-and-deserialize-binary-tree",
      "moduleId": "week-07-bst-patterns",
      "order": 8,
      "title": "Serialize and Deserialize Binary Tree",
      "type": "practice",
      "estimatedMinutes": 75,
      "priority": "core",
      "topics": [
        "trees"
      ],
      "description": "Day 49, Phase 2 Capstone. Solve \"Serialize and Deserialize Binary Tree\" (Hard).",
      "practice": {
        "provider": "leetcode",
        "slug": "serialize-and-deserialize-binary-tree",
        "title": "Serialize and Deserialize Binary Tree",
        "difficulty": "hard"
      },
      "dependsOn": [
        "tree-construction"
      ]
    },
    {
      "id": "heap-invariants",
      "moduleId": "week-08-heaps",
      "order": 1,
      "title": "Heap invariants",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "heap"
      ],
      "description": "Day 50. Min-heap vs Max-heap properties and array representation indexing formulas.",
      "objectives": [
        "State the min-heap and max-heap properties",
        "Use the parent and child index formulas"
      ],
      "verificationQuestions": [
        "Why can a heap be stored in a plain array?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Heap invariants",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "heap-operations",
      "moduleId": "week-08-heaps",
      "order": 2,
      "title": "Heap operations",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "heap"
      ],
      "description": "Day 51. Sifting up (O(log n) insert), sifting down (O(log n) extract-min), O(n) heapify.",
      "objectives": [
        "Insert with sift up and extract with sift down",
        "Explain why heapify is O(n)"
      ],
      "verificationQuestions": [
        "Why is building a heap O(n) and not O(n log n)?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Heap operations",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "priority-queue-adt",
      "moduleId": "week-08-heaps",
      "order": 3,
      "title": "Priority queue abstract data type",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "heap"
      ],
      "description": "Day 52. Applications in scheduling and streaming top-K items.",
      "objectives": [
        "Describe the priority queue interface",
        "Use a heap for streaming top-K"
      ],
      "verificationQuestions": [
        "Why does a size-k min-heap find the k largest items?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Priority queue abstract data type",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "heap-standard-libraries",
      "moduleId": "week-08-heaps",
      "order": 4,
      "title": "Language standard libraries",
      "type": "lesson",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "heap"
      ],
      "description": "Day 53. Python heapq / Java PriorityQueue / C++ std::priority_queue.",
      "objectives": [
        "Use your language heap library correctly",
        "Simulate a max-heap when only a min-heap exists"
      ],
      "verificationQuestions": [
        "How do you get max-heap behaviour from Python heapq?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Language standard libraries",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "kth-largest-element-in-a-stream",
      "moduleId": "week-08-heaps",
      "order": 5,
      "title": "Kth Largest Element in a Stream",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "heap"
      ],
      "description": "Day 54, LeetCode Heap Drills. Solve \"Kth Largest Element in a Stream\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "kth-largest-element-in-a-stream",
        "title": "Kth Largest Element in a Stream",
        "difficulty": "easy"
      },
      "dependsOn": [
        "heap-operations"
      ]
    },
    {
      "id": "last-stone-weight",
      "moduleId": "week-08-heaps",
      "order": 6,
      "title": "Last Stone Weight",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "heap"
      ],
      "description": "Day 54, LeetCode Heap Drills. Solve \"Last Stone Weight\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "last-stone-weight",
        "title": "Last Stone Weight",
        "difficulty": "easy"
      },
      "dependsOn": [
        "heap-operations"
      ]
    },
    {
      "id": "kth-largest-element-in-an-array",
      "moduleId": "week-08-heaps",
      "order": 7,
      "title": "Kth Largest Element in an Array",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "heap"
      ],
      "description": "Day 55, LeetCode Top-K Problems. Solve \"Kth Largest Element in an Array\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "kth-largest-element-in-an-array",
        "title": "Kth Largest Element in an Array",
        "difficulty": "medium"
      },
      "dependsOn": [
        "priority-queue-adt"
      ]
    },
    {
      "id": "k-closest-points-to-origin",
      "moduleId": "week-08-heaps",
      "order": 8,
      "title": "K Closest Points to Origin",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "heap"
      ],
      "description": "Day 55, LeetCode Top-K Problems. Solve \"K Closest Points to Origin\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "k-closest-points-to-origin",
        "title": "K Closest Points to Origin",
        "difficulty": "medium"
      },
      "dependsOn": [
        "priority-queue-adt"
      ]
    },
    {
      "id": "visualgo-heap",
      "moduleId": "week-08-heaps",
      "order": 9,
      "title": "VisuAlgo module: binary heap",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "heap"
      ],
      "description": "Day 56. Animate Binary Max Heap operations on VisuAlgo (visualgo.net/en/heap).",
      "resources": [
        {
          "title": "VisuAlgo: binary heap",
          "url": "https://visualgo.net/en/heap",
          "kind": "visualizer",
          "minutes": 15,
          "sourceId": "visualgo"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "backtracking-mechanics",
      "moduleId": "week-09-backtracking",
      "order": 1,
      "title": "Backtracking mechanics",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "backtracking"
      ],
      "description": "Day 57. State-space tree exploration, choice-making, recursion, and undoing choices.",
      "objectives": [
        "Describe a state-space tree",
        "Write the choose, explore, undo loop"
      ],
      "verificationQuestions": [
        "Why must a choice be undone before trying the next one?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Backtracking mechanics",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "subsets-power-sets",
      "moduleId": "week-09-backtracking",
      "order": 2,
      "title": "Subsets and power sets",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "backtracking"
      ],
      "description": "Day 58. Decision trees for inclusion/exclusion of elements.",
      "objectives": [
        "Draw the include/exclude decision tree",
        "State how many subsets n elements have"
      ],
      "verificationQuestions": [
        "Why does a set of n elements have 2^n subsets?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Subsets and power sets",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "backtracking-mechanics"
      ]
    },
    {
      "id": "permutations-combinations",
      "moduleId": "week-09-backtracking",
      "order": 3,
      "title": "Permutations and combinations",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "backtracking"
      ],
      "description": "Day 59. Swapping elements and tracking visited states.",
      "objectives": [
        "Generate permutations by swapping or visited flags",
        "Tell permutations and combinations apart"
      ],
      "verificationQuestions": [
        "What state do you track to avoid reusing an element?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Permutations and combinations",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "backtracking-mechanics"
      ]
    },
    {
      "id": "pruning-state-space",
      "moduleId": "week-09-backtracking",
      "order": 4,
      "title": "Pruning state space",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "backtracking"
      ],
      "description": "Day 60. Constraint checking to abort unfeasible branches early.",
      "objectives": [
        "Add constraint checks that cut branches early",
        "Estimate how much pruning saves"
      ],
      "verificationQuestions": [
        "How does an early constraint check change the search cost?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Pruning state space",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "backtracking-mechanics"
      ]
    },
    {
      "id": "subsets",
      "moduleId": "week-09-backtracking",
      "order": 5,
      "title": "Subsets",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "backtracking"
      ],
      "description": "Day 61, LeetCode Backtracking I. Solve \"Subsets\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "subsets",
        "title": "Subsets",
        "difficulty": "medium"
      },
      "dependsOn": [
        "subsets-power-sets"
      ]
    },
    {
      "id": "combination-sum",
      "moduleId": "week-09-backtracking",
      "order": 6,
      "title": "Combination Sum",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "backtracking"
      ],
      "description": "Day 61, LeetCode Backtracking I. Solve \"Combination Sum\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "combination-sum",
        "title": "Combination Sum",
        "difficulty": "medium"
      },
      "dependsOn": [
        "permutations-combinations"
      ]
    },
    {
      "id": "permutations",
      "moduleId": "week-09-backtracking",
      "order": 7,
      "title": "Permutations",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "backtracking"
      ],
      "description": "Day 62, LeetCode Backtracking II. Solve \"Permutations\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "permutations",
        "title": "Permutations",
        "difficulty": "medium"
      },
      "dependsOn": [
        "permutations-combinations"
      ]
    },
    {
      "id": "word-search",
      "moduleId": "week-09-backtracking",
      "order": 8,
      "title": "Word Search",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "backtracking"
      ],
      "description": "Day 62, LeetCode Backtracking II. Solve \"Word Search\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "word-search",
        "title": "Word Search",
        "difficulty": "medium"
      },
      "dependsOn": [
        "pruning-state-space"
      ]
    },
    {
      "id": "n-queens",
      "moduleId": "week-09-backtracking",
      "order": 9,
      "title": "N Queens Placement",
      "type": "practice",
      "estimatedMinutes": 75,
      "priority": "recommended",
      "topics": [
        "backtracking"
      ],
      "description": "Day 63, Advanced Backtracking. Solve N Queens Placement (Hard) or review decision trees.",
      "practice": {
        "provider": "leetcode",
        "slug": "n-queens",
        "title": "N Queens Placement",
        "difficulty": "hard"
      },
      "dependsOn": [
        "pruning-state-space"
      ]
    },
    {
      "id": "disjoint-set-union-find",
      "moduleId": "week-10-union-find-graphs",
      "order": 1,
      "title": "Disjoint-set union-find (DSU)",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 64. The find and union operations, and representative parent arrays.",
      "objectives": [
        "Implement find and union with a parent array",
        "Explain what a representative is"
      ],
      "verificationQuestions": [
        "What does find return and why does union call it twice?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Disjoint-set union-find (DSU)",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "dsu-optimizations",
      "moduleId": "week-10-union-find-graphs",
      "order": 2,
      "title": "DSU optimizations",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 65. Path compression and union by rank/size yielding amortized O(alpha(n)) time.",
      "objectives": [
        "Add path compression",
        "Add union by rank or size"
      ],
      "verificationQuestions": [
        "Why do both optimizations together give near-constant time?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "DSU optimizations",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": [
        "disjoint-set-union-find"
      ]
    },
    {
      "id": "graph-representations",
      "moduleId": "week-10-union-find-graphs",
      "order": 3,
      "title": "Graph representations",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 66. Adjacency Matrix vs Adjacency List memory and lookup trade-offs.",
      "objectives": [
        "Build an adjacency list and a matrix",
        "Compare memory and edge lookup costs"
      ],
      "tradeoffs": [
        "Adjacency matrix: O(1) edge lookup, O(V^2) memory vs adjacency list: O(V + E) memory, slower edge lookup"
      ],
      "verificationQuestions": [
        "When does an adjacency matrix beat an adjacency list?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Graph representations",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "graph-dfs-bfs",
      "moduleId": "week-10-union-find-graphs",
      "order": 4,
      "title": "Graph DFS and BFS",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 67. Connected components, cycle detection in undirected graphs.",
      "objectives": [
        "Count connected components with DFS or BFS",
        "Detect a cycle in an undirected graph"
      ],
      "verificationQuestions": [
        "How do you avoid revisiting nodes in a graph traversal?"
      ],
      "resources": [
        {
          "title": "Data Structures Easy to Advanced Course",
          "kind": "video",
          "minutes": 30,
          "section": "Graph DFS and BFS",
          "sourceId": "fiset-course"
        }
      ],
      "dependsOn": [
        "graph-representations"
      ]
    },
    {
      "id": "number-of-islands",
      "moduleId": "week-10-union-find-graphs",
      "order": 5,
      "title": "Number of Islands",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 68, LeetCode DSU & Graph Basics. Solve \"Number of Islands\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "number-of-islands",
        "title": "Number of Islands",
        "difficulty": "medium"
      },
      "dependsOn": [
        "graph-dfs-bfs"
      ]
    },
    {
      "id": "redundant-connection",
      "moduleId": "week-10-union-find-graphs",
      "order": 6,
      "title": "Redundant Connection",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 68, LeetCode DSU & Graph Basics. Solve \"Redundant Connection\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "redundant-connection",
        "title": "Redundant Connection",
        "difficulty": "medium"
      },
      "dependsOn": [
        "dsu-optimizations"
      ]
    },
    {
      "id": "clone-graph",
      "moduleId": "week-10-union-find-graphs",
      "order": 7,
      "title": "Clone Graph",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 69, LeetCode Graph Traversal. Solve \"Clone Graph\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "clone-graph",
        "title": "Clone Graph",
        "difficulty": "medium"
      },
      "dependsOn": [
        "graph-dfs-bfs"
      ]
    },
    {
      "id": "pacific-atlantic-water-flow",
      "moduleId": "week-10-union-find-graphs",
      "order": 8,
      "title": "Pacific Atlantic Water Flow",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 69, LeetCode Graph Traversal. Solve \"Pacific Atlantic Water Flow\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "pacific-atlantic-water-flow",
        "title": "Pacific Atlantic Water Flow",
        "difficulty": "medium"
      },
      "dependsOn": [
        "graph-dfs-bfs"
      ]
    },
    {
      "id": "visualgo-dsu-graph-traversal",
      "moduleId": "week-10-union-find-graphs",
      "order": 9,
      "title": "VisuAlgo module: DSU and graph traversal",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 70. Animate DSU on VisuAlgo (visualgo.net/en/ufds) and Graph Traversal (visualgo.net/en/dfsbfs).",
      "resources": [
        {
          "title": "VisuAlgo: union-find",
          "url": "https://visualgo.net/en/ufds",
          "kind": "visualizer",
          "minutes": 15,
          "sourceId": "visualgo"
        },
        {
          "title": "VisuAlgo: graph traversal",
          "url": "https://visualgo.net/en/dfsbfs",
          "kind": "visualizer",
          "minutes": 15,
          "sourceId": "visualgo"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "directed-acyclic-graphs",
      "moduleId": "week-11-topological-shortest-paths",
      "order": 1,
      "title": "Directed acyclic graphs (DAGs)",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 71. In-degree tracking and dependency ordering.",
      "objectives": [
        "Compute in-degrees for a DAG",
        "Explain how in-degree gives a dependency order"
      ],
      "verificationQuestions": [
        "Why does a cycle make a valid ordering impossible?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Directed acyclic graphs (DAGs)",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "graph-dfs-bfs"
      ]
    },
    {
      "id": "topological-sort-algorithms",
      "moduleId": "week-11-topological-shortest-paths",
      "order": 2,
      "title": "Topological sort algorithms",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 72. Kahn's BFS Algorithm vs. DFS Post-order traversal.",
      "objectives": [
        "Run Kahn's algorithm",
        "Produce an order from DFS post-order"
      ],
      "verificationQuestions": [
        "How does Kahn's algorithm detect a cycle?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Topological sort algorithms",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "directed-acyclic-graphs"
      ]
    },
    {
      "id": "shortest-path-theory",
      "moduleId": "week-11-topological-shortest-paths",
      "order": 3,
      "title": "Shortest path theory",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "advanced-graphs"
      ],
      "description": "Day 73. Single-source shortest path, non-negative edge weights.",
      "objectives": [
        "Define single-source shortest path",
        "Explain why non-negative weights matter"
      ],
      "verificationQuestions": [
        "What goes wrong with a negative edge in a greedy shortest path search?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Shortest path theory",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "graph-dfs-bfs"
      ]
    },
    {
      "id": "dijkstras-algorithm",
      "moduleId": "week-11-topological-shortest-paths",
      "order": 4,
      "title": "Dijkstra's algorithm",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "advanced-graphs"
      ],
      "description": "Day 74. Min-priority queue optimization yielding O((V + E) log V) time.",
      "objectives": [
        "Run Dijkstra with a min-priority queue",
        "Derive the O((V + E) log V) bound"
      ],
      "verificationQuestions": [
        "Why does a priority queue make Dijkstra faster than scanning for the minimum?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Dijkstra's algorithm",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "shortest-path-theory",
        "priority-queue-adt"
      ]
    },
    {
      "id": "minimum-spanning-trees",
      "moduleId": "week-11-topological-shortest-paths",
      "order": 5,
      "title": "Minimum spanning trees",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "advanced-graphs"
      ],
      "description": "Day 75. Kruskal's algorithm with DSU vs Prim's algorithm with Priority Queue.",
      "objectives": [
        "Run Kruskal's algorithm with a DSU",
        "Run Prim's algorithm with a priority queue"
      ],
      "verificationQuestions": [
        "When would you prefer Kruskal over Prim?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Minimum spanning trees",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "dsu-optimizations",
        "priority-queue-adt"
      ]
    },
    {
      "id": "course-schedule",
      "moduleId": "week-11-topological-shortest-paths",
      "order": 6,
      "title": "Course Schedule",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 76, LeetCode Topological Sort. Solve \"Course Schedule\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "course-schedule",
        "title": "Course Schedule",
        "difficulty": "medium"
      },
      "dependsOn": [
        "topological-sort-algorithms"
      ]
    },
    {
      "id": "course-schedule-ii",
      "moduleId": "week-11-topological-shortest-paths",
      "order": 7,
      "title": "Course Schedule II",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "graphs"
      ],
      "description": "Day 76, LeetCode Topological Sort. Solve \"Course Schedule II\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "course-schedule-ii",
        "title": "Course Schedule II",
        "difficulty": "medium"
      },
      "dependsOn": [
        "topological-sort-algorithms"
      ]
    },
    {
      "id": "network-delay-time",
      "moduleId": "week-11-topological-shortest-paths",
      "order": 8,
      "title": "Network Delay Time",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "advanced-graphs"
      ],
      "description": "Day 77, LeetCode Shortest Path / MST. Solve \"Network Delay Time\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "network-delay-time",
        "title": "Network Delay Time",
        "difficulty": "medium"
      },
      "dependsOn": [
        "dijkstras-algorithm"
      ]
    },
    {
      "id": "cheapest-flights-within-k-stops",
      "moduleId": "week-11-topological-shortest-paths",
      "order": 9,
      "title": "Cheapest Flights Within K Stops",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "advanced-graphs"
      ],
      "description": "Day 77, LeetCode Shortest Path / MST. Solve \"Cheapest Flights Within K Stops\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "cheapest-flights-within-k-stops",
        "title": "Cheapest Flights Within K Stops",
        "difficulty": "medium"
      },
      "dependsOn": [
        "dijkstras-algorithm"
      ]
    },
    {
      "id": "dp-core-principles",
      "moduleId": "week-12-dp-1d",
      "order": 1,
      "title": "DP core principles",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 78. Overlapping subproblems, optimal substructure, memoization vs. tabulation.",
      "objectives": [
        "Spot overlapping subproblems and optimal substructure",
        "Convert memoization to tabulation"
      ],
      "verificationQuestions": [
        "What makes a problem a dynamic programming problem rather than plain recursion?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "DP core principles",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "fibonacci-staircase-patterns",
      "moduleId": "week-12-dp-1d",
      "order": 2,
      "title": "Fibonacci and staircase patterns",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 79. Transition state design dp[i] = dp[i-1] + dp[i-2].",
      "objectives": [
        "Define the state and transition for a staircase problem",
        "Reduce the table to two variables"
      ],
      "verificationQuestions": [
        "Why does dp[i] only need the previous two values?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Fibonacci and staircase patterns",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "dp-core-principles"
      ]
    },
    {
      "id": "unbounded-knapsack-coin-change",
      "moduleId": "week-12-dp-1d",
      "order": 3,
      "title": "Unbounded knapsack and coin change",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 80. State transitions with reusable items.",
      "objectives": [
        "Define the state for reusable items",
        "Write the coin change transition"
      ],
      "verificationQuestions": [
        "How does allowing reuse change the loop order versus 0/1 knapsack?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Unbounded knapsack and coin change",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "dp-core-principles"
      ]
    },
    {
      "id": "subsequence-patterns",
      "moduleId": "week-12-dp-1d",
      "order": 4,
      "title": "Subsequence patterns",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 81. Longest Increasing Subsequence state formulation.",
      "objectives": [
        "Formulate dp[i] for the longest increasing subsequence",
        "State the O(n^2) transition"
      ],
      "verificationQuestions": [
        "What does dp[i] mean in the LIS formulation?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Subsequence patterns",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "dp-core-principles"
      ]
    },
    {
      "id": "climbing-stairs",
      "moduleId": "week-12-dp-1d",
      "order": 5,
      "title": "Climbing Stairs",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 82, LeetCode 1D DP I. Solve \"Climbing Stairs\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "climbing-stairs",
        "title": "Climbing Stairs",
        "difficulty": "easy"
      },
      "dependsOn": [
        "fibonacci-staircase-patterns"
      ]
    },
    {
      "id": "min-cost-climbing-stairs",
      "moduleId": "week-12-dp-1d",
      "order": 6,
      "title": "Min Cost Climbing Stairs",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 82, LeetCode 1D DP I. Solve \"Min Cost Climbing Stairs\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "min-cost-climbing-stairs",
        "title": "Min Cost Climbing Stairs",
        "difficulty": "easy"
      },
      "dependsOn": [
        "fibonacci-staircase-patterns"
      ]
    },
    {
      "id": "house-robber",
      "moduleId": "week-12-dp-1d",
      "order": 7,
      "title": "House Robber",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 83, LeetCode 1D DP II. Solve \"House Robber\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "house-robber",
        "title": "House Robber",
        "difficulty": "medium"
      },
      "dependsOn": [
        "fibonacci-staircase-patterns"
      ]
    },
    {
      "id": "coin-change",
      "moduleId": "week-12-dp-1d",
      "order": 8,
      "title": "Coin Change",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 83, LeetCode 1D DP II. Solve \"Coin Change\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "coin-change",
        "title": "Coin Change",
        "difficulty": "medium"
      },
      "dependsOn": [
        "unbounded-knapsack-coin-change"
      ]
    },
    {
      "id": "longest-increasing-subsequence",
      "moduleId": "week-12-dp-1d",
      "order": 9,
      "title": "Longest Increasing Subsequence",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 84, LeetCode LIS. Solve \"Longest Increasing Subsequence\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "longest-increasing-subsequence",
        "title": "Longest Increasing Subsequence",
        "difficulty": "medium"
      },
      "dependsOn": [
        "subsequence-patterns"
      ]
    },
    {
      "id": "word-break",
      "moduleId": "week-12-dp-1d",
      "order": 10,
      "title": "Word Break",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-1d"
      ],
      "description": "Day 84, LeetCode LIS. Solve \"Word Break\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "word-break",
        "title": "Word Break",
        "difficulty": "medium"
      },
      "dependsOn": [
        "dp-core-principles"
      ]
    },
    {
      "id": "grid-dp",
      "moduleId": "week-13-dp-2d",
      "order": 1,
      "title": "2D grid DP",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-2d"
      ],
      "description": "Day 85. Path counting and minimum cost paths in 2D matrices.",
      "objectives": [
        "Count paths in a grid with a 2D table",
        "Find a minimum cost path"
      ],
      "verificationQuestions": [
        "Which neighbouring cells does each grid cell depend on?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "2D grid DP",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "dp-core-principles"
      ]
    },
    {
      "id": "zero-one-knapsack",
      "moduleId": "week-13-dp-2d",
      "order": 2,
      "title": "0/1 knapsack problem",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-2d"
      ],
      "description": "Day 86. Item inclusion/exclusion with weight constraints.",
      "objectives": [
        "Define the include/exclude state",
        "Fill the knapsack table"
      ],
      "verificationQuestions": [
        "Why does 0/1 knapsack need the item index in its state?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "0/1 knapsack problem",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "dp-core-principles"
      ]
    },
    {
      "id": "string-matching-dp",
      "moduleId": "week-13-dp-2d",
      "order": 3,
      "title": "String matching DP",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-2d"
      ],
      "description": "Day 87. Longest Common Subsequence (LCS) and Edit Distance state matrices.",
      "objectives": [
        "Build the LCS table",
        "Build the edit distance table"
      ],
      "verificationQuestions": [
        "What do the three neighbouring cells represent in the edit distance recurrence?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "String matching DP",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "dp-core-principles"
      ]
    },
    {
      "id": "dp-space-optimization",
      "moduleId": "week-13-dp-2d",
      "order": 4,
      "title": "Space optimization tricks",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-2d"
      ],
      "description": "Day 88. Reducing 2D DP matrices to 1D arrays using rolling rows.",
      "objectives": [
        "Keep only the rows the recurrence needs",
        "Convert a 2D table to a 1D array safely"
      ],
      "verificationQuestions": [
        "When is it safe to overwrite the previous row in place?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Space optimization tricks",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "grid-dp"
      ]
    },
    {
      "id": "unique-paths",
      "moduleId": "week-13-dp-2d",
      "order": 5,
      "title": "Unique Paths",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-2d"
      ],
      "description": "Day 89, LeetCode 2D DP I. Solve \"Unique Paths\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "unique-paths",
        "title": "Unique Paths",
        "difficulty": "medium"
      },
      "dependsOn": [
        "grid-dp"
      ]
    },
    {
      "id": "longest-common-subsequence",
      "moduleId": "week-13-dp-2d",
      "order": 6,
      "title": "Longest Common Subsequence",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-2d"
      ],
      "description": "Day 89, LeetCode 2D DP I. Solve \"Longest Common Subsequence\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "longest-common-subsequence",
        "title": "Longest Common Subsequence",
        "difficulty": "medium"
      },
      "dependsOn": [
        "string-matching-dp"
      ]
    },
    {
      "id": "best-time-to-buy-and-sell-stock-with-cooldown",
      "moduleId": "week-13-dp-2d",
      "order": 7,
      "title": "Best Time to Buy and Sell Stock with Cooldown",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-2d"
      ],
      "description": "Day 90, LeetCode 2D DP II. Solve \"Best Time to Buy and Sell Stock with Cooldown\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "best-time-to-buy-and-sell-stock-with-cooldown",
        "title": "Best Time to Buy and Sell Stock with Cooldown",
        "difficulty": "medium"
      },
      "dependsOn": [
        "dp-core-principles"
      ]
    },
    {
      "id": "target-sum",
      "moduleId": "week-13-dp-2d",
      "order": 8,
      "title": "Target Sum",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "dp-2d"
      ],
      "description": "Day 90, LeetCode 2D DP II. Solve \"Target Sum\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "target-sum",
        "title": "Target Sum",
        "difficulty": "medium"
      },
      "dependsOn": [
        "zero-one-knapsack"
      ]
    },
    {
      "id": "edit-distance",
      "moduleId": "week-13-dp-2d",
      "order": 9,
      "title": "Edit Distance",
      "type": "practice",
      "estimatedMinutes": 75,
      "priority": "core",
      "topics": [
        "dp-2d"
      ],
      "description": "Day 91, LeetCode Hard DP. Solve \"Edit Distance\" (Hard).",
      "practice": {
        "provider": "leetcode",
        "slug": "edit-distance",
        "title": "Edit Distance",
        "difficulty": "hard"
      },
      "dependsOn": [
        "string-matching-dp"
      ]
    },
    {
      "id": "interval-problems",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 1,
      "title": "Interval problems",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "intervals"
      ],
      "description": "Day 92. Sorting by start/end times, overlapping intervals, merging logic.",
      "objectives": [
        "Sort intervals and detect overlaps",
        "Merge overlapping intervals"
      ],
      "verificationQuestions": [
        "Why does sorting by start time make merging a single pass?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Interval problems",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "greedy-algorithms",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 2,
      "title": "Greedy algorithms",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "greedy"
      ],
      "description": "Day 93. Local optimal choices, greedy choice property, and interval scheduling.",
      "objectives": [
        "State the greedy choice property",
        "Solve interval scheduling greedily"
      ],
      "verificationQuestions": [
        "How do you argue that a greedy choice is safe?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Greedy algorithms",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "bit-manipulation-basics",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 3,
      "title": "Bit manipulation basics",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "bit-manipulation"
      ],
      "description": "Day 94. Bitwise AND, OR, XOR, NOT, left/right shifts, bitmasks.",
      "objectives": [
        "Apply AND, OR, XOR and NOT",
        "Use shifts and bitmasks"
      ],
      "verificationQuestions": [
        "What does x & (x - 1) do to the bits of x?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Bit manipulation basics",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": []
    },
    {
      "id": "bit-tricks",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 4,
      "title": "Bit tricks",
      "type": "lesson",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "bit-manipulation"
      ],
      "description": "Day 95. Checking power of two, counting set bits (Brian Kernighan's algorithm), XOR single number.",
      "objectives": [
        "Check for a power of two",
        "Count set bits with Brian Kernighan's algorithm"
      ],
      "verificationQuestions": [
        "Why does XOR of all elements find the single number?"
      ],
      "resources": [
        {
          "title": "Roadmap (roadmap.sh and NeetCode 150)",
          "kind": "course",
          "minutes": 30,
          "section": "Bit tricks",
          "sourceId": "neetcode-roadmap"
        }
      ],
      "dependsOn": [
        "bit-manipulation-basics"
      ]
    },
    {
      "id": "merge-intervals",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 5,
      "title": "Merge Intervals",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "intervals"
      ],
      "description": "Day 96, LeetCode Intervals. Solve \"Merge Intervals\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "merge-intervals",
        "title": "Merge Intervals",
        "difficulty": "medium"
      },
      "dependsOn": [
        "interval-problems"
      ]
    },
    {
      "id": "non-overlapping-intervals",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 6,
      "title": "Non-overlapping Intervals",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "intervals"
      ],
      "description": "Day 96, LeetCode Intervals. Solve \"Non-overlapping Intervals\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "non-overlapping-intervals",
        "title": "Non-overlapping Intervals",
        "difficulty": "medium"
      },
      "dependsOn": [
        "greedy-algorithms"
      ]
    },
    {
      "id": "jump-game",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 7,
      "title": "Jump Game",
      "type": "practice",
      "estimatedMinutes": 45,
      "priority": "core",
      "topics": [
        "greedy"
      ],
      "description": "Day 97, LeetCode Greedy & Bits. Solve \"Jump Game\" (Medium).",
      "practice": {
        "provider": "leetcode",
        "slug": "jump-game",
        "title": "Jump Game",
        "difficulty": "medium"
      },
      "dependsOn": [
        "greedy-algorithms"
      ]
    },
    {
      "id": "single-number",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 8,
      "title": "Single Number",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "bit-manipulation"
      ],
      "description": "Day 97, LeetCode Greedy & Bits. Solve \"Single Number\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "single-number",
        "title": "Single Number",
        "difficulty": "easy"
      },
      "dependsOn": [
        "bit-tricks"
      ]
    },
    {
      "id": "number-of-1-bits",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 9,
      "title": "Number of 1 Bits",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "bit-manipulation"
      ],
      "description": "Day 97, LeetCode Greedy & Bits. Solve \"Number of 1 Bits\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "number-of-1-bits",
        "title": "Number of 1 Bits",
        "difficulty": "easy"
      },
      "dependsOn": [
        "bit-tricks"
      ]
    },
    {
      "id": "counting-bits",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 10,
      "title": "Counting Bits",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "bit-manipulation"
      ],
      "description": "Day 98, Weekly Review. Solve \"Counting Bits\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "counting-bits",
        "title": "Counting Bits",
        "difficulty": "easy"
      },
      "dependsOn": [
        "bit-tricks"
      ]
    },
    {
      "id": "reverse-bits",
      "moduleId": "week-14-intervals-greedy-bits",
      "order": 11,
      "title": "Reverse Bits",
      "type": "practice",
      "estimatedMinutes": 30,
      "priority": "core",
      "topics": [
        "bit-manipulation"
      ],
      "description": "Day 98, Weekly Review. Solve \"Reverse Bits\" (Easy).",
      "practice": {
        "provider": "leetcode",
        "slug": "reverse-bits",
        "title": "Reverse Bits",
        "difficulty": "easy"
      },
      "dependsOn": [
        "bit-tricks"
      ]
    },
    {
      "id": "timed-mock-day-1",
      "moduleId": "week-15-timed-mocks",
      "order": 1,
      "title": "Timed mock practice: day 1",
      "type": "assessment",
      "estimatedMinutes": 90,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Day 99. Timed problem solving using Grind 75: 2 Medium problems in 45-minute timed simulations. Articulate your thoughts aloud, write clean code on a blank editor, and analyze time and space complexity before coding.",
      "resources": [
        {
          "title": "Grind 75",
          "url": "https://www.techinterviewhandbook.org/grind75/",
          "kind": "tool",
          "minutes": 90,
          "sourceId": "interview-handbook"
        }
      ],
      "dependsOn": [
        "reverse-bits"
      ],
      "notBeforeDay": 99
    },
    {
      "id": "timed-mock-day-2",
      "moduleId": "week-15-timed-mocks",
      "order": 2,
      "title": "Timed mock practice: day 2",
      "type": "assessment",
      "estimatedMinutes": 90,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Day 100. Timed problem solving using Grind 75: 2 Medium problems in 45-minute timed simulations. Articulate your thoughts aloud, write clean code on a blank editor, and analyze time and space complexity before coding.",
      "resources": [
        {
          "title": "Grind 75",
          "url": "https://www.techinterviewhandbook.org/grind75/",
          "kind": "tool",
          "minutes": 90,
          "sourceId": "interview-handbook"
        }
      ],
      "dependsOn": [
        "timed-mock-day-1"
      ],
      "notBeforeDay": 100
    },
    {
      "id": "timed-mock-day-3",
      "moduleId": "week-15-timed-mocks",
      "order": 3,
      "title": "Timed mock practice: day 3",
      "type": "assessment",
      "estimatedMinutes": 90,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Day 101. Timed problem solving using Grind 75: 2 Medium problems in 45-minute timed simulations. Articulate your thoughts aloud, write clean code on a blank editor, and analyze time and space complexity before coding.",
      "resources": [
        {
          "title": "Grind 75",
          "url": "https://www.techinterviewhandbook.org/grind75/",
          "kind": "tool",
          "minutes": 90,
          "sourceId": "interview-handbook"
        }
      ],
      "dependsOn": [
        "timed-mock-day-2"
      ],
      "notBeforeDay": 101
    },
    {
      "id": "timed-mock-day-4",
      "moduleId": "week-15-timed-mocks",
      "order": 4,
      "title": "Timed mock practice: day 4",
      "type": "assessment",
      "estimatedMinutes": 90,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Day 102. Timed problem solving using Grind 75: 2 Medium problems in 45-minute timed simulations. Articulate your thoughts aloud, write clean code on a blank editor, and analyze time and space complexity before coding.",
      "resources": [
        {
          "title": "Grind 75",
          "url": "https://www.techinterviewhandbook.org/grind75/",
          "kind": "tool",
          "minutes": 90,
          "sourceId": "interview-handbook"
        }
      ],
      "dependsOn": [
        "timed-mock-day-3"
      ],
      "notBeforeDay": 102
    },
    {
      "id": "timed-mock-day-5",
      "moduleId": "week-15-timed-mocks",
      "order": 5,
      "title": "Timed mock practice: day 5",
      "type": "assessment",
      "estimatedMinutes": 90,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Day 103. Timed problem solving using Grind 75: 2 Medium problems in 45-minute timed simulations. Articulate your thoughts aloud, write clean code on a blank editor, and analyze time and space complexity before coding.",
      "resources": [
        {
          "title": "Grind 75",
          "url": "https://www.techinterviewhandbook.org/grind75/",
          "kind": "tool",
          "minutes": 90,
          "sourceId": "interview-handbook"
        }
      ],
      "dependsOn": [
        "timed-mock-day-4"
      ],
      "notBeforeDay": 103
    },
    {
      "id": "timed-mock-day-6",
      "moduleId": "week-15-timed-mocks",
      "order": 6,
      "title": "Timed mock practice: day 6",
      "type": "assessment",
      "estimatedMinutes": 90,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Day 104. Timed problem solving using Grind 75: 2 Medium problems in 45-minute timed simulations. Articulate your thoughts aloud, write clean code on a blank editor, and analyze time and space complexity before coding.",
      "resources": [
        {
          "title": "Grind 75",
          "url": "https://www.techinterviewhandbook.org/grind75/",
          "kind": "tool",
          "minutes": 90,
          "sourceId": "interview-handbook"
        }
      ],
      "dependsOn": [
        "timed-mock-day-5"
      ],
      "notBeforeDay": 104
    },
    {
      "id": "timed-mock-day-7",
      "moduleId": "week-15-timed-mocks",
      "order": 7,
      "title": "Timed mock practice: day 7",
      "type": "assessment",
      "estimatedMinutes": 90,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Day 105. Timed problem solving using Grind 75: 2 Medium problems in 45-minute timed simulations. Articulate your thoughts aloud, write clean code on a blank editor, and analyze time and space complexity before coding.",
      "resources": [
        {
          "title": "Grind 75",
          "url": "https://www.techinterviewhandbook.org/grind75/",
          "kind": "tool",
          "minutes": 90,
          "sourceId": "interview-handbook"
        }
      ],
      "dependsOn": [
        "timed-mock-day-6"
      ],
      "notBeforeDay": 105
    },
    {
      "id": "cheatsheet-review",
      "moduleId": "week-16-interview-readiness",
      "order": 1,
      "title": "Tech Interview Handbook cheatsheet review",
      "type": "lesson",
      "estimatedMinutes": 60,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Week 16. Comprehensive review using Tech Interview Handbook cheatsheets.",
      "dependsOn": [
        "timed-mock-day-7"
      ],
      "objectives": [
        "Recall the key patterns from each cheatsheet",
        "Spot the topics that still feel weak"
      ],
      "verificationQuestions": [
        "Which topic from the cheatsheets do you still solve slowly?"
      ],
      "resources": [
        {
          "title": "Tech Interview Handbook",
          "kind": "article",
          "minutes": 40,
          "section": "Tech Interview Handbook cheatsheet review",
          "sourceId": "interview-handbook"
        }
      ]
    },
    {
      "id": "edge-case-review",
      "moduleId": "week-16-interview-readiness",
      "order": 2,
      "title": "Edge cases review",
      "type": "review",
      "estimatedMinutes": 60,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Week 16. Review edge cases: empty input, null pointers, integer overflow.",
      "dependsOn": [
        "cheatsheet-review"
      ],
      "verificationQuestions": [
        "What are the empty-input, null and overflow cases for the last problem you solved?"
      ]
    },
    {
      "id": "behavioral-star-practice",
      "moduleId": "week-16-interview-readiness",
      "order": 3,
      "title": "Behavioral responses (STAR method)",
      "type": "practice",
      "estimatedMinutes": 60,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Week 16. Practice behavioral responses with the STAR method.",
      "dependsOn": [
        "edge-case-review"
      ]
    },
    {
      "id": "system-design-fundamentals",
      "moduleId": "week-16-interview-readiness",
      "order": 4,
      "title": "System design fundamentals",
      "type": "lesson",
      "estimatedMinutes": 60,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Week 16. Review system design fundamentals.",
      "dependsOn": [
        "behavioral-star-practice"
      ],
      "objectives": [
        "List the building blocks of a basic system design answer",
        "Walk through a simple design end to end"
      ],
      "verificationQuestions": [
        "What do you clarify before drawing any boxes?"
      ],
      "resources": [
        {
          "title": "Tech Interview Handbook",
          "kind": "article",
          "minutes": 40,
          "section": "System design fundamentals",
          "sourceId": "interview-handbook"
        }
      ]
    },
    {
      "id": "offer-negotiation-fundamentals",
      "moduleId": "week-16-interview-readiness",
      "order": 5,
      "title": "Offer negotiation fundamentals",
      "type": "lesson",
      "estimatedMinutes": 60,
      "priority": "core",
      "topics": [
        "interview-practice"
      ],
      "description": "Week 16. Review offer negotiation fundamentals.",
      "dependsOn": [
        "system-design-fundamentals"
      ],
      "objectives": [
        "List what can be negotiated besides salary",
        "Prepare a calm response to a first offer"
      ],
      "verificationQuestions": [
        "What should you establish before you answer a first number?"
      ],
      "resources": [
        {
          "title": "Tech Interview Handbook",
          "kind": "article",
          "minutes": 40,
          "section": "Offer negotiation fundamentals",
          "sourceId": "interview-handbook"
        }
      ]
    }
  ]
}
```
