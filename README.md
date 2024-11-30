# Project Walnut

![Walnut_Lycoris-Recoil](https://github.com/user-attachments/assets/e387eeb7-0bff-48b1-a277-264d28ccf0a9)   
[Walnut the mascot](https://lycoris-recoil.fandom.com/wiki/Kurumi)

Welcome to the **Project Walnut** project. It is a simple webapp for small-startups to post their blogs, or news outlets for publishing news article 

## Features

- **User Authentication**
  - Sign up and login functionality using secure authentication. For editors, moderators and site admins(web master)
  - Admins can disable or enable registration from site configurations
- **CRUD Operations**
  - Create, read, update, and delete blog posts.
  - proper access privilege for admin dashboard access
  - Webmaster portal for maintaining site settings and global site config
  - Markdown support in editors
- **Comments Section**
  - Users can comment on posts using disqus integration. (In progress)
  - Comments will be saved to DB with DDoS protection (In progress)
- **Responsive Design**
  - Accessible on both desktop and mobile devices.
  - Accessible Dark/light UI for better reading experience

## Technologies Used

- **Frontend**
  - HTML5, CSS3, JavaScript, EJS
- **Backend**
  - Node.js, Express.js
  - Database: MongoDB with Mongoose ODM

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Debagnik/project-walnut.git
   ```
2. **Navigate to the project directory:**
   ```bash
   cd project-walnut
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Configure the environment variables:**
   - Create a `.env` file and add your MongoDB URI and any other required configurations as below.
     ```text
     MONGO_DB_URI=mongodb://username:password@host/blog #Required
     PORT= #Optonal, defaults to 5000
     JWT_SECRET=your-default-jwt-secrets #Required
     SESSION_SECRET=your-secure-session-secret #Required
     NODE_ENV=dev-local #Defaults to dev-local use production in production scenario
     DEFAULT_POST_THUMBNAIL_LINK=/img/placeholder.webp #Keep it as is
     ```
5. **Start the application:**
   ```bash
   npm start
   ```
   or on Developer machine
   ```bash
   npm run dev
   ```

## Usage

- Access the application at `http://localhost:5000` in your web browser.
- Register a new account or log in with existing credentials.
- Create new blog posts, edit them, or delete if necessary.
- View and comment on other users' posts.

## Contributing

I welcome all enhancement and bugfix and issue reports. Please feel free to contibute
If you are interested in contributing to this project:
1. Fork the repository
2. Create a branch from the latest release.
3. Submit your pull request against the release branch.
4. Please also label your PR (enhancement for adding features, Bugfix for for bug fixing PRs)
PS: You contribution will be reviewed by codeRabbitAi and it's tone of review will be bit harsh I made it to sound like a Tsundere, but it sometimes come of rude. 

## License

This project is licensed under the MIT License.

## Contact

For any questions or concerns, you can reach out at [info@debagnik.in](mailto:info@debagnik.in).

## Acknowledgments
This project is enhanced by:
- [CodeRabbitAI](https://coderabbit.ai) - Code review assistance
- [Tabnine AI](https://www.tabnine.com/) - Code completion support
