const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const post = require('../models/posts');
const siteConfig = require('../models/config');
const user = require('../models/user');

const jwtSecretKey = process.env.JWT_SECRET;
const { PRIVILEGE_LEVELS_ENUM, isWebMaster } = require('../../utils/validations');
/**
 * Site config Middleware
 */

const fetchSiteConfig = async (req, res, next) => {
    try {
        const config = await siteConfig.findOne();
        if (!config) {
            console.warn('Site config is not available in database');
            res.locals.siteConfig = {};
        } else {
            res.locals.siteConfig = config;
        }
        next();
    } catch (error) {
        console.error("Critical: Site Config Fetch error", error.message);
        return res.status(500).render('error', {
            locals: {
                title: 'Configuration Error',
                description: 'Unable to load site configuration'
            }
        });
    }
}

router.use(fetchSiteConfig);

if (!jwtSecretKey) {
    console.error('JWT_SECRET is not defined. Please set it in your environment variables.');
    // You might want to exit the process gracefully
    process.exit(1);
}

//Routes
/**
 * GET /
 * HOME
 */
router.get('', async (req, res) => {

    try {
        const locals = {
            title: res.locals.siteConfig.siteName || "Project Walnut",
            description: res.locals.siteConfig.siteMetaDataDescription || "A blogging site created with Node, express and MongoDB",
            config: res.locals.siteConfig,
        }

        let perPage = res.locals.siteConfig.defaultPaginationLimit || 1;
        let page = req.query.page || 1;

        const data = await post.aggregate([
            { $match: { isApproved: true } },
            { $sort: { createdAt: -1 } }
        ]).skip(perPage * page - perPage).limit(perPage).exec();

        const count = await post.countDocuments({ isApproved: true });
        const nextPage = parseInt(page) + 1;
        const hasNextPage = nextPage <= Math.ceil(count / perPage);


        res.render('index', {
            locals,
            data,
            current: page,
            nextPage: hasNextPage ? nextPage : null
        });
        console.log(`DB Posts Data fetched`);
    } catch (error) {
        console.log(error);
    }
});

/**
 * GET /about
 * About
 */
router.get('/about', (req, res) => {
    const locals = {
        title: 'About Us Section' + ' - ' + (res.locals.siteConfig.siteName || 'Project Walnut'),
        description: "A blogging site created with Node, express and MongoDB",
        config: res.locals.siteConfig
    }
    res.render('about', {
        locals
    });
});

/**
 * GET /contact
 * Contact
 */
router.get('/contact', (req, res) => {
    const locals = {
        title: "Contacts us" + ' - ' + (res.locals.siteConfig.siteName || 'Project Walnut'),
        description: "A blogging site created with Node, express and MongoDB",
        config: res.locals.siteConfig
    }
    res.render('contact', {
        locals
    });
});

/**
 * GET /
 * Posts :id
 */
router.get('/post/:id', async (req, res) => {
    try {
        let currentUser = null;
        const token = req.cookies.token;
        let userId = null;
        if (token) {
            try {
                const decoded = jwt.verify(token, jwtSecretKey);
                userId = decoded.userId;
            } catch (err) {
                console.error('Invalid token:', err.message);
            }
        }
        if (userId) {
            currentUser = await user.findById(userId);
        }

        let slug = req.params.id;
        const data = await post.findById({ _id: slug });
        if (!data) {
            throw new Error('404 - No such post found');
        }
        const locals = {
            title: data.title,
            description: data.desc,
            keywords: data.tags,
            config: res.locals.siteConfig
        }
        const postAuthor = await user.findOne({ username: data.author });
        if (!postAuthor) {
            data.author = 'Anonymous'
        } else {
            data.author = postAuthor.name;
        }
        
        if(currentUser || data.isApproved) {
            res.render('posts', {
                locals,
                data
            });
        } else {
            res.redirect('/404');
        }

    } catch (error) {
        console.error('Post Fetch error', error);
        res.status(404).render('404', {
            locals: {
                title: "404 - Page Not Found",
                description: "The page you're looking for doesn't exist.",
                config: res.locals.siteConfig
            }
        });
    }
});

/**
 * POST /
 * Search: Search term
 */
router.post('/search', async (req, res) => {
    try {

        let searchLimit = res.locals.siteConfig.searchLimit;
        let searchTerm = req.body.searchTerm;
        searchTerm = searchTerm.trim().replace(/[<>]/g, '');
        if (!searchTerm || typeof searchTerm !== 'string') {
            return res.status(400).json({ error: 'Invalid search term' });
        }
        if (searchTerm.trim().length == 0) {
            return res.status(400).json({ error: 'Search term cannot be empty' });
        }
        if (searchTerm.trim().length > 100) {
            return res.status(400).json({ error: 'Search term is too long' });
        }
        const searchNoSpecialChar = searchTerm.replace(/[^a-zA-Z0-9 ]/g, "");
        console.log(new Date(), " - Simple Search - ", searchTerm, " - regex search: ", searchNoSpecialChar);

        const locals = {
            title: "Search - " + searchTerm,
            description: "Simple Search Page",
            config: res.locals.siteConfig
        }

        const data = await post.find(
            {
                $and: [
                    { $text: { $search: searchNoSpecialChar } },
                    { isApproved: true }
                ]
            },
            { score: { $meta: 'textScore' } }
        )
            .sort({ score: { $meta: 'textScore' } })
            .limit(searchLimit);

        res.render('search', { data, locals, searchTerm: searchTerm });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).render('error', {
            locals: {
                title: 'Error'
            },
            error: 'Unable to perform search at this time',
            config: res.locals.siteConfig
        });
    }
})

module.exports = router;
