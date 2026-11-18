Review the project thoroughly and identify actionable issues and improvements.

1. **Bugs**

   * Find logic errors, edge cases, broken assumptions, and likely runtime failures.
   * Prioritize issues that can affect correctness or reliability.

2. **Security**

   * Check for vulnerabilities, unsafe input handling, exposed secrets, insecure defaults, authorization issues, and dependency-related risks.
   * Clearly distinguish confirmed issues from potential risks.

3. **Performance**

   * Identify unnecessary work, inefficient algorithms, excessive I/O, repeated queries, memory issues, blocking operations, and obvious scalability problems.
   * Focus on meaningful bottlenecks rather than premature micro-optimizations.

4. **Improvements**

   * Suggest concrete improvements to maintainability, readability, architecture, testing, error handling, and developer experience.
   * Avoid cosmetic recommendations unless they provide clear value.

5. **Summary**

   * Provide a concise summary of the most important findings.
   * Prioritize findings by severity and expected impact.
   * Include file names or code locations when possible.

Do not invent issues. Base every finding on the actual project code and clearly state when something cannot be verified.
