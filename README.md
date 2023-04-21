# cocosci-optdisco

Navigation experiments over graphs to characterize hierarchical structure in behavior.

Test out the entire experiment [here](https://cocosci-optdisco.herokuapp.com) or try out specific tasks:
- [GraphTraining](https://cocosci-optdisco.herokuapp.com/testexperiment?type=GraphTraining)
- [PathIdentification](https://cocosci-optdisco.herokuapp.com/testexperiment?type=PathIdentification)

Adapted from Fred Callaway's [PsiTurk + Heroku](https://github.com/fredcallaway/psirokuturk) starter repository.

All emojis designed by [OpenMoji](https://openmoji.org/) – the open-source emoji and icon project. License: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## Quickstart

### Installation

Project requires Python 3.9+ and Postgres. Depending on the method of Postgres installation, you might have to set your PATH to point to Postgres binaries for Python dependency installation to succeed.

Install Python dependencies into a virtualenv:
```
python3 -m venv env
. env/bin/activate
pip install -r requirements.txt
```

We also use Parcel to bundle JavaScript and CSS, which requires installation:
```
npm install
```

In order to run the server, we use a Procfile runner, like `forego`, which you can install with:
```
brew install forego
```

### Run the server

Run the server via the Makefile:
```
. env/bin/activate
make dev
```

To run the server without a Procfile runner (`forego`) you need to run the following two commands: the Python server (with `make dev-python`) and the JavaScript bundler (with `npm run watch`).

### Try it out!

Now, try out the [entire experiment](http://localhost:22362/) or demo specific plugins:
- [GraphTraining](http://localhost:22362/testexperiment?type=GraphTraining)
- [PathIdentification](http://localhost:22362/testexperiment?type=PathIdentification)

### Errors

_Note: These instructions are likely to be very outdated._

If you're seeing an `Library not loaded: @rpath/libssl.1.1.dylib ... Reason: image not found` error when running `./bin/psiturk-herokudb', you may need to `pip uninstall psycopg2` and run the following:
```
pip install --global-option=build_ext \
            --global-option="-I/usr/local/opt/openssl/include" \
            --global-option="-L/usr/local/opt/openssl/lib" -r requirements.txt
```

## Heroku

This application needs the `heroku/nodejs` buildpack to compile JS/CSS/etc and the `heroku/python` buildpack to run the server. The following creates an application with appropriate buildpacks:
```
heroku create $PROJECTNAME --buildpack heroku/nodejs --buildpack heroku/python
```

If you already created the app with different buildpacks, the following will set the appropriate buildpacks:
```
heroku buildpacks:clear
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add heroku/python
```

This project also requires a Postgres database when deployed. When creating an application, add a database with the following:
```
heroku addons:create heroku-postgresql
```

Once heroku has been [added as a git remote](https://devcenter.heroku.com/articles/git#create-a-heroku-remote), deploy with a push:
```
git push heroku master
```

## Experiment workflow
1. Prep code! Make sure cost on consent screen (`templates/consent.html`) is up to date.
2. Update `experiment_code_version` and make a git tag marking commit the code was run with.
3. Scale up Heroku: `heroku ps:scale --app cocosci-optdisco web=1:Hobby`.
4. Using `./bin/psiturk-herokudb`, ensure `mode live`, submit with `hit create <# HIT> <payment> <expiry>`. Example is `hit create 9 4.00 1`.
5. Use sanity script to keep track of HITs & automatically scale down Heroku: `python bin/sanity.py cocosci-optdisco`.
6. Pay/Approve workers for a HIT with `worker approve --hit $HIT`. See HITs with `hit list --active`.
7. Verify all workers have been paid with `worker list --submitted`.
8. Download data with `PORT= ON_HEROKU=1 DATABASE_URL=$(heroku config:get DATABASE_URL) bin/fetch_data.py $CODE_VERSION`.


## Adding new OpenMoji

To add new OpenMoji, you need to edit `static/optdisco/images/openmoji/copyscript.py` by adding in the new emoji to copy in. You'll first have to download the OpenMoji SVG Color pack from [their site](https://openmoji.org/) and change paths in the script to work for your installation. Then run `copyscript.py`.
