# eden

Eden is a Python provisioner and compiler for [webtask.io](https://webtask.io), allowing users to write webtasks using Python and giving them access to the full range of modules available on [PyPI](https://pypi.org). 

It is designed to be run using an Amazon EC2 virtual machine for packaging modules, and an S3 bucket for storage. The compiler queries the database to see if the available module package is already made, and will either queue it for provisioning or download it to the webtask machine as appropriate. (Currently if the package needs to be provisioned, the user will need to run it once to start the process and then again once it is done; it is not automatic).

### Script and requirements.txt

The programming model for the Python webtask is as a WSGI app, and the script should contain a function with the appropriate signature. The compiler runs the webtask using [Ymir][Ymir link], a WSGI compliant server for Node. The json of the webtask context can be accessed through wtcontext (`from wtcontext import context`).

The required modules should be listed using the same format as a pip-generated requirements.txt file. This information should be given either in a requirements.txt file that is packaged in a .tar.gz file with the Python script file, or as a multiline string at the beginning of the .py file. [script.py](../master/scripts/script.py) shows an example of the latter.

#### Original meme

![We put a webtask in your webtask so you can webtask while you webtask](https://i.imgflip.com/28ngag.jpg)

[Ymir link]: https://github.com/a-bowers/ymir
