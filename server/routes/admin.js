const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const sanitizeHtml = require('sanitize-html');
const marked = require('marked');

const router = express.Router();
const post = require('../models/posts');
const user = require('../models/user');
const siteConfig = require('../models/config');

const { PRIVILEGE_LEVELS_ENUM, isWebMaster, isValidURI } = require('../../utils/validations');

const jwtSecretKey = process.env.JWT_SECRET;
const adminLayout = '../views/layouts/admin';


if (!jwtSecretKey) {
  throw new Error('JWT_SECRET is not set in Environment variable');
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, //15 mins
  max: 5 // limit each IP to 5 requests per windowMs
});

// adding admin CSRF protection middleware
const csrfProtection = csrf({ cookie: true });
router.use(csrfProtection);

/**
 * Checks login middleware
 */
const authToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect('/admin');
  }

  try {
    const decoded = jwt.verify(token, jwtSecretKey);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error('Invalid token', error);
    return res.redirect('/admin');
  }
}

/**
 * Site config Middleware
 */

const fetchSiteConfig = async (req, res, next) => {
  try {
    const config = await siteConfig.findOne();
    if (!config) {
      console.warn('Site config is not available');
      res.locals.siteConfig = {};
    } else {
      res.locals.siteConfig = config;
    }
    next();
  } catch (error) {
    console.error("Site Config Fetch error", error.message);
    res.locals.siteConfig = {};
    next();
  }
}

router.use(fetchSiteConfig);

/**
 * Post add/edit markdown function
 */
function markdownToHtml(markdownString) {
  try {
    // convert markdown string to HTML string
    let htmlString = marked.parse(markdownString);

    // sanitize HTML string to prevent XSS attacks
    htmlString = sanitizeHtml(htmlString, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'title']
      }
    });
    return htmlString.replace(/<(\/?)h([1-3])>/g, (match, p1, p2) => {
      const newLevel = parseInt(p2) + 1;
      return `<${p1}h${newLevel}>`;
    });
  } catch (error) {
    console.error("Markdown to HTML conversion error", error.message);
    throw new Error('Failed to process markdown content');
  }
}


//Routes
/**
 * GET /
 * ADMIN - Login
 */
router.get('/admin', async (req, res) => {
  try {

    const locals = {
      title: "Admin Panel",
      description: "Admin Panel",
      config: res.locals.siteConfig
    }
    res.render('admin/index', {
      locals,
      layout: adminLayout,
      errors: [],
      errors_login: [],
      csrfToken: req.csrfToken(),
      isWebMaster: false
    });
  } catch (error) {
    console.error("Admin Page error", error.message);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST /
 * ADMIN - Register
 */
router.post('/register', async (req, res) => {
  try {
    const { username, password, name, confirm_password } = req.body;

    //check for empty field
    if (!name || !username || !password || !confirm_password) {
      console.error(401, 'empty mandatory fields');
      return res.status(401).render('admin/index', {
        errors: [{ msg: 'Name, Username or Passwords are empty' }],
        errors_login: [],
        config: res.locals.siteConfig,
        csrfToken: req.csrfToken(),
        isWebMaster: false
      });
    }

    // checking for existing user
    const existingUser = await user.findOne({ username })
    if (existingUser) {
      console.error(409, 'Username already exists');
      return res.status(409).render('admin/index', {
        errors: [{ msg: 'Username already exists!' }],
        errors_login: [],
        config: res.locals.siteConfig,
        csrfToken: req.csrfToken(), isWebMaster: false
      });
    }

    //Define strong passwords
    const isStrongPassword = (password) => {
      const minLength = 8;
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecialChar = /[!@#$%^&*()]/.test(password);
      return password.length >= minLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar;
    }

    //check password and confirm password match
    if (!(password === confirm_password)) {
      console.error('Password and confirm passwords do not match');
      return res.render('admin/index', {
        errors: [{ msg: 'Passwords and Confirm Password do not match!' }],
        errors_login: [],
        config: res.locals.siteConfig,
        csrfToken: req.csrfToken(),
        isWebMaster: false
      });
    }

    if (!isStrongPassword(password)) {
      return res.render('admin/index', {
        errors: [{ msg: 'Password is too weak. It should be at least 8 characters long, contain at least one uppercase letter, one lowercase letter, one number, and one special character.' }],
        errors_login: [],
        config: res.locals.siteConfig,
        csrfToken: req.csrfToken(),
        isWebMaster: false
      });
    }

    //registration logic
    if (res.locals.siteConfig.isRegistrationEnabled) {
      const hashedPassword = await bcrypt.hash(password, 10);
      try {
        const newUser = await user.create({ username, password: hashedPassword, name });
        console.log('User created', newUser, 201);
        res.redirect('/admin/registration');
      } catch (error) {
        console.error(500, 'Internal Server Error');
        return res.render('admin/index', {
          errors: [{
            msg: 'We are facing some difficulty. Please hang back while we resolve this issue.'
          }],
          errors_login: [],
          csrfToken: req.csrfToken(),
          isWebMaster: false,
          config: res.locals.siteConfig
        });
      }
    } else {
      return res.render('admin/index', {
        errors: [{
          msg: 'Registration not enabled, Contact with Site admin'
        }],
        errors_login: [],
        config: res.locals.siteConfig,
        csrfToken: req.csrfToken(),
        isWebMaster: false
      });
    }
  } catch (error) {
    console.error('error in post', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST
 * Admin - Check Login
 */
router.post('/admin', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    //checks if the username or passwords are not empty
    if (!username || !password) {
      return res.render('admin/index', {
        errors_login: [{
          msg: 'Username and Passwords are mandatory'
        }],
        config: res.locals.siteConfig,
        errors: [],
        csrfToken: req.csrfToken(),
        isWebMaster: false
      });
    }

    //checks if the user exists
    const currentUser = await user.findOne({ username });
    if (!currentUser) {
      console.error(401, 'invalid credentials for user: ', username);
      return res.render('admin/index', {
        errors_login: [{ msg: 'Invalid login credentials!' }],
        config: res.locals.siteConfig,
        errors: [],
        csrfToken: req.csrfToken(),
        isWebMaster: false
      });
    }

    //password validity check
    const isPasswordValid = await bcrypt.compare(password, currentUser.password);
    if (!isPasswordValid) {
      console.error(401, 'invalid credentials for user: ', username);
      return res.render('admin/index', {
        errors_login: [{ msg: 'Invalid login credentials!' }],
        config: res.locals.siteConfig,
        errors: [], csrfToken: req.csrfToken(), isWebMaster: false
      });
    }

    //adds session
    const token = jwt.sign({ userId: currentUser._id }, jwtSecretKey);
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/dashboard');
  } catch (error) {
    //for any other errors
    console.error(error);
    return res.render('admin/index', {
      errors_login: [{ msg: 'We are facing some difficulty. Please hang back while we resolve this issue.' }],
      config: res.locals.siteConfig,
      errors: [],
      csrfToken: req.csrfToken(),
      isWebMaster: false
    });
  }
});

/**
 * GET
 * Admin - Registration success
 */

router.get('/admin/registration', async (req, res) => {
  const locals = {
    title: 'Registration successful',
    description: 'Registration successful',
    config: res.locals.siteConfig
  };
  res.status(201).render('admin/registration', {
    locals,
    layout: adminLayout,
    csrfToken: req.csrfToken(),
    isWebMaster: false
  });
});

/**
 * GET
 * Admin - Dashboard
 */
router.get('/dashboard', authToken, async (req, res) => {
  try {
    const locals = {
      title: 'Admin Dashboard',
      description: 'Dashboard Panel',
      config: res.locals.siteConfig
    };

    const currentUser = await user.findById(req.userId);
    if (!currentUser) {
      console.error('User not found', req.userId);
      return res.redirect('/admin');
    }
    let data;
    switch (currentUser.privilege) {
      case PRIVILEGE_LEVELS_ENUM.WRITER:
        data = await post.find({ author: currentUser.username }).sort({ createdAt: -1 });
        break;
      case PRIVILEGE_LEVELS_ENUM.MODERATOR:
        data = await post.find().sort({ createdAt: -1 });
        break;
      case PRIVILEGE_LEVELS_ENUM.WEBMASTER:
        data = await post.find().sort({ createdAt: -1 });
        break;
      default:
        return res.status(403).json({
          error: 'Invalid privilege level',
          message: 'You do not have the required permissions'
        });
    }

    res.render('admin/dashboard', {
      locals,
      layout: adminLayout,
      currentUser,
      data,
      csrfToken: req.csrfToken(),
      isWebMaster: isWebMaster(currentUser)
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * GET
 * Admin - new post
 */
router.get('/admin/add-post', authToken, async (req, res) => {
  try {
    const locals = {
      title: 'Add Post',
      description: 'Add Post',
      config: res.locals.siteConfig
    };

    const currentUser = await user.findById(req.userId);
    if (!currentUser) {
      console.error('User not found', req.userId);
      return res.redirect('/admin');
    }

    res.render('admin/add-post', {
      locals,
      layout: adminLayout,
      currentUser,
      csrfToken: req.csrfToken(),
      isWebMaster: isWebMaster(currentUser)
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST
 * Admin - new post
 */
router.post('/admin/add-post', authToken, async (req, res) => {
  try {
    const currentUser = await user.findById(req.userId);
    if (!currentUser) {
      console.error('User not found', req.userId);
      return res.redirect('/admin');
    }

    const currentSiteConfig = await siteConfig.findOne();
    let siteConfigDefaultThumbnail;
    if (!currentSiteConfig) {
      console.error('Site configuration not found');
      siteConfigDefaultThumbnail = process.env.DEFAULT_POST_THUMBNAIL_LINK
    } else {
      siteConfigDefaultThumbnail = currentSiteConfig.siteDefaultThumbnailUri;
    }

    const defaultThumbnailImageURI = isValidURI(req.body.thumbnailImageURI) ? req.body.thumbnailImageURI : siteConfigDefaultThumbnail

    if (!req.body.title?.trim() || !req.body.markdownbody?.trim() || !req.body.desc?.trim()) {
      return res.status(400).send('Title, body, and description are required!');
    }
    const MAX_TITLE_LENGTH = 50;
    const MAX_DESCRIPTION_LENGTH = 500;
    const MAX_BODY_LENGTH = 100000;

    if (req.body.title.length > MAX_TITLE_LENGTH || req.body.markdownbody.length > MAX_BODY_LENGTH || req.body.desc.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).send('Title, body, and description must not exceed their respective limits!');
    }

    const htmlBody = markdownToHtml(req.body.markdownbody.trim());

    const newPost = new post({
      title: req.body.title.trim(),
      markdownbody: req.body.markdownbody.trim(),
      body: htmlBody,
      author: currentUser.username.trim(),
      tags: req.body.tags.trim(),
      desc: req.body.desc.trim(),
      thumbnailImageURI: defaultThumbnailImageURI,
      lastUpdateAuthor: currentUser.username.trim(),
      modifiedAt: Date.now()
    });

    await newPost.save();

    console.log('New post added by ', currentUser.username, '\n', newPost);

    res.redirect('/dashboard');

  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * GET
 * Admin Edit post
 */
router.get('/edit-post/:id', authToken, async (req, res) => {
  try {

    const data = await post.findOne({ _id: req.params.id });

    const locals = {
      title: "Edit Post - " + data.title,
      description: "Post Editor",
      config: res.locals.siteConfig
    };

    const currentUser = await user.findById(req.userId);

    res.render('admin/edit-post', {
      locals,
      data,
      layout: adminLayout,
      csrfToken: req.csrfToken(),
      isWebMaster: isWebMaster(currentUser),
      currentUser: { privilege: currentUser.privilege }
    })

  } catch (error) {
    console.log(error);
  }

});

/**
 * PUT /
 * Admin - Edit Post
*/
router.put('/edit-post/:id', authToken, async (req, res) => {
  try {
    const currentUser = await user.findById(req.userId);
    if (!currentUser) {
      console.error('User not found', req.userId);
      return res.redirect('/admin');
    }

    const currentSiteConfig = await siteConfig.findOne();
    let siteConfigDefaultThumbnail;
    if (!currentSiteConfig) {
      console.error('Site configuration not found');
      siteConfigDefaultThumbnail = process.env.DEFAULT_POST_THUMBNAIL_LINK
    } else {
      siteConfigDefaultThumbnail = currentSiteConfig.siteDefaultThumbnailUri;
    }

    const defaultThumbnailImageURI = isValidURI(req.body.thumbnailImageURI) ? req.body.thumbnailImageURI : siteConfigDefaultThumbnail;

    if (!req.body.title?.trim() || !req.body.markdownbody?.trim() || !req.body.desc?.trim()) {
      return res.status(400).send('Title, body, and description are required!');
    }

    const MAX_TITLE_LENGTH = 50;
    const MAX_DESCRIPTION_LENGTH = 500;
    const MAX_BODY_LENGTH = 100000;

    if (req.body.title.length > MAX_TITLE_LENGTH || req.body.markdownbody.length > MAX_BODY_LENGTH || req.body.desc.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).send('Title, body, and description must not exceed their respective limits!');
    }

    const htmlBody = markdownToHtml(req.body.markdownbody.trim());

    const updatePostData = {
      title: req.body.title.trim(),
      body: htmlBody,
      markdownbody: req.body.markdownbody.trim(),
      desc: req.body.desc.trim(),
      tags: req.body.tags.trim(),
      thumbnailImageURI: defaultThumbnailImageURI,
      modifiedAt: Date.now(),
      lastUpdateAuthor: currentUser.username
    }

    if (currentUser.privilege === PRIVILEGE_LEVELS_ENUM.MODERATOR || currentUser.privilege === PRIVILEGE_LEVELS_ENUM.WEBMASTER) {
      updatePostData.isApproved = req.body.isApproved === 'on'
    } 

    await post.findByIdAndUpdate(req.params.id, updatePostData);

    const updatedPost = await post.findById(req.params.id);
    if (!updatedPost) {
      console.error('Failed to update post', req.params.id);
      return res.status(500).send('Failed to update post');
    }

    res.redirect(`/dashboard/`);

  } catch (error) {
    console.log(error);
  }

});

/**
 * DELETE
 * Admin - Post - Delete
 */

router.delete('/delete-post/:id', authToken, async (req, res) => {
  try {
    const currentUser = await user.findById(req.userId);
    if (!currentUser) {
      console.error('User not found', req.userId);
      return res.redirect('/admin');
    }

    const postToDelete = await post.findById(req.params.id);
    if (!postToDelete) {
      console.error('Post not found', req.params.id);
      return res.status(404).send('Post not found');
    }

    console.log('Post deleted successfully\nDeletion Request: ', currentUser.username, '\nDeleted Post: ', postToDelete);
    await post.deleteOne({ _id: req.params.id });
    res.redirect('/dashboard');
  } catch (error) {
    console.log(error);
  }
});

/**
 * GET /
 * Admin Logout
*/
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/admin');
});

/**
 * GET - Admin Webmaster
 */
router.get('/admin/webmaster', authToken, async (req, res) => {
  try {
    const currentUser = await user.findById(req.userId);
    if (!currentUser) {
      console.error('User not found', req.userId);
      return res.status(403).json({
        locals: {
          title: 'Access Denied',
          description: 'Insufficient privileges',
          config: res.locals.siteConfig
        },
        layout: adminLayout,
        error: 'Only webmasters can access this page',
        isWebMaster: false
      });
    }

    // Check if the user has the necessary privileges (assuming 1 is the highest privilege)
    if (currentUser.privilege !== PRIVILEGE_LEVELS_ENUM.WEBMASTER) {
      return res.status(403).redirect('/error')
    }

    const locals = {
      title: "Webmaster Panel",
      description: "Webmaster Administration Panel",
      config: res.locals.siteConfig
    }

    let config = await siteConfig.findOne();
    if (!config) {
      config = new siteConfig({
        isRegistrationEnabled: false,
        siteName: 'Blog-Site',
        lastModifiedBy: 'System',
      });
      await config.save();
    }

    const users = await user.find({ _id: { $ne: currentUser._id } }).sort({ privilege: -1 });

    res.render('admin/webmaster', {
      locals,
      layout: adminLayout,
      currentUser,
      csrfToken: req.csrfToken(),
      isWebMaster: isWebMaster(currentUser),
      config: config,
      users
    });
  } catch (error) {
    console.error("Webmaster Page error", error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * POST
 * Site Level Settings
 */
router.post('/edit-site-config', authToken, async (req, res) => {
  try {
    const currentUser = await user.findById(req.userId);
    if (!currentUser) {
      console.error('User not found', req.userId);
      return res.redirect('/admin');
    }

    if (currentUser.privilege === PRIVILEGE_LEVELS_ENUM.WEBMASTER) {
      // Update site settings in the database
      let globalSiteConfig = await siteConfig.findOne();

      // Validate critical fields
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (req.body.siteAdminEmail && !emailRegex.test(req.body.siteAdminEmail)) {
        return res.status(400).send('Invalid email format');
      }
      const paginationLimit = parseInt(req.body.defaultPaginationLimit);
      if (Number.isNaN(paginationLimit) || paginationLimit < 1 || paginationLimit > 100) {
        return res.status(400).send('Invalid pagination limit');
      }

      const searchLimit = parseInt(req.body.searchLimit);
      if (Number.isNaN(searchLimit) || searchLimit < 1 || searchLimit > 50) {
        return res.status(400).send('Invalid search limit');
      }


      let validUrl = globalSiteConfig.siteDefaultThumbnailUri;
      if (req.body.siteDefaultThumbnailUri) {
        validUrl = isValidURI(req.body.siteDefaultThumbnailUri) ? req.body.siteDefaultThumbnailUri : process.env.DEFAULT_POST_THUMBNAIL_LINK;
      }
      const registrationEnable = req.body.isRegistrationEnabled === 'on';

      let validHomePageImageUri = globalSiteConfig.homepageWelcomeImage;
      if (req.body.homepageWelcomeImage) {
        validHomePageImageUri = isValidURI(req.body.homepageWelcomeImage) ? req.body.homepageWelcomeImage : validUrl;
      }

      // global site settings helper
      const createConfigObject = (req, currentUser, validUrl, validHomePageImageUri, registrationEnable) => ({
        isRegistrationEnabled: registrationEnable,
        siteName: req.body.siteName,
        siteMetaDataKeywords: req.body.siteMetaDataKeywords,
        siteMetaDataAuthor: req.body.siteMetaDataAuthor,
        siteMetaDataDescription: req.body.siteMetaDataDescription,
        siteAdminEmail: req.body.siteAdminEmail,
        siteDefaultThumbnailUri: validUrl,
        defaultPaginationLimit: req.body.defaultPaginationLimit,
        lastModifiedDate: Date.now(),
        lastModifiedBy: currentUser.username,
        googleAnalyticsScript: req.body.googleAnalyticsScript,
        inspectletScript: req.body.inspectletScript,
        homeWelcomeText: req.body.homeWelcomeText,
        homeWelcomeSubText: req.body.homeWelcomeSubText,
        homepageWelcomeImage: validHomePageImageUri,
        copyrightText: req.body.copyrightText,
        searchLimit: searchLimit
      });

      if (!globalSiteConfig) {
        globalSiteConfig = new siteConfig(createConfigObject(req, currentUser, validUrl, validHomePageImageUri, registrationEnable));
        await globalSiteConfig.save();
      } else {
        await siteConfig.findOneAndUpdate({}, createConfigObject(req, currentUser, validUrl, validHomePageImageUri, registrationEnable), { new: true });
      }
      console.log(`Site settings updated successfully by user: ${currentUser.username}`);
      res.redirect('/admin/webmaster');
    } else {
      res.status(403).send('Unauthorized');
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send('Internal Server Error');
  }
});

/**
 * DELETE
 * Webmaster - User - Delete
 */
router.delete('/delete-user/:id', authToken, async (req, res) => {
  try {
    const currentUser = await user.findById(req.userId);
    if (!currentUser || currentUser.privilege !== PRIVILEGE_LEVELS_ENUM.WEBMASTER) {
      console.error('Unauthorized user tried to delete different user', req.userId);
      return res.status(403).send('Unauthorized');
    }

    const userToDelete = await user.findById(req.params.id);
    if (!userToDelete) {
      console.error('User not found', req.params.id);
      return res.status(404).send('user not found');
    }

    //prevent self deletion
    if (currentUser._id.toString() === userToDelete._id.toString()) {
      return res.status(405).json({
        error: 'Invalid Operation',
        message: 'Self-deletion is not allowed for security reasons'
      });
    }

    console.log('User deleted successfully\nDeletion Request: ', currentUser.username, '\nDeleted user: ', userToDelete);
    await user.deleteOne({ _id: req.params.id });
    res.redirect('/admin/webmaster');
  } catch (error) {
    console.log(error);
    res.status(500).send('Internal Server Error');
  }
});


/**
 * GET
 * Webmaster Edit user
 */
router.get('/edit-user/:id', authToken, async (req, res) => {
  try {

    const selectedUser = await user.findOne({ _id: req.params.id });
    if (!selectedUser) {
      console.error('User not found', req.params.id);
      return res.status(404).send('User not found');
    }

    const locals = {
      title: "Webmaster - Edit User - " + selectedUser.name,
      description: "User Editor",
      config: res.locals.siteConfig
    };

    const currentUser = await user.findById(req.userId);

    res.render('admin/edit-user', {
      locals,
      selectedUser,
      layout: adminLayout,
      csrfToken: req.csrfToken(),
      isWebMaster: isWebMaster(currentUser),
      showDelete: currentUser.username !== selectedUser.username,
      config: res.locals.siteConfig
    })

  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }

});

/**
 * PUT /
 * Webmaster - Edit users
*/
router.put('/edit-user/:id', authToken, async (req, res) => {
  try {
    const currentUser = await user.findById(req.userId);
    if (!currentUser || currentUser.privilege !== PRIVILEGE_LEVELS_ENUM.WEBMASTER) {
      console.error('Unauthorized user tried to delete different user', req.userId);
      return res.status(403).send('Unauthorized');
    }

    if (!req.body.name || !req.body.name.trim()) {
      return res.status(400).send('Name is required');
    }

    const sanitizedName = sanitizeHtml(req.body.name.trim(), {
      allowedTags: [],
      allowedAttributes: {}
    });

    if (sanitizedName !== req.body.name.trim()) {
      return res.status(400).json({
        error: 'validation error',
        message: 'Invalid characters in name. Only alphabets and spaces are allowed.'
      });
    }

    if (!Object.values(PRIVILEGE_LEVELS_ENUM).includes(parseInt(req.body.privilege))) {
      return res.status(400).send('Invalid privilege level');
    }

    await user.findByIdAndUpdate(req.params.id, {
      name: req.body.name.trim(),
      privilege: req.body.privilege,
      modifiedAt: Date.now()
    });

    const updatedUser = await user.findById(req.params.id);
    if (!updatedUser) {
      console.error('Failed to update user', req.params.id);
      return res.status(500).send('Failed to update user');
    }

    res.redirect(`/admin/webmaster`);

  } catch (error) {
    console.log(error);
    res.status(500).send('Internal Server Error');
  }

});

module.exports = router;