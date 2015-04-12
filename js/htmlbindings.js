(function(){
    "use strict";

    /*=============================
    =            Scope            =
    =============================*/
    
    function Scope(scope){
        this.constructor = Scope;
        this.childs = [];
        this.parent = null;
        this.mainTemplate = new Template(this);
        this.repeats = [];

        if(typeof scope === "object" && scope !== null){
            this.scope = scope;
        } else {
            this.scope = {};
        }
    }

    Scope.prototype.createChild = function(scope){
        var child = new Scope(scope);
        this.childs.push(child);
        child.parent = this;
        return child;
    };

    Scope.prototype.get = function(varStr){
        if(typeof varStr === "string"){
            return this._get(varStr.split("."));
        } else {
            return this.scope;
        }
    };

    Scope.prototype._get = function(path){
        var ref = this.scope, i;
        for (i = 0; i < path.length-1; i++) {
            ref = ref[path[i]];
            if(ref === undefined || ref === null){
                return this._getFromParent(path);
            }
        }

        if(ref.hasOwnProperty(path[i])){
            return ref[path[i]];
        } else {
            return this._getFromParent(path);
        }
    };

    Scope.prototype._getFromParent = function(variable){
        if(this.parent !== null){
            return this.parent._get(variable);
        } else {
            return undefined;
        }
    };

    Scope.prototype.initTemplate = function(element){
        this._initRepeat(element);
        this.mainTemplate.init(element);
    };

    Scope.prototype._initRepeat = function(element){
        var repeats = element.querySelectorAll("[hb-repeat]"),
            result, attr, scope, variable, nextElement, i, j;

        this.repeats = [];

        for (i = 0; i < repeats.length; i++) {
            attr = repeats[i].getAttribute("hb-repeat");
            if(attr !== null){
                result = Scope.HBREP_REG.exec(attr);
                assert(result !== null, "InvalidHBRepeat", attr);

                scope = this.createChild();
                scope.initTemplate(repeats[i]);

                for (j = 0; repeats[i].parentNode.childNodes[j] !== repeats[i]; j++) {}

                this.repeats.push({
                    scope: scope,
                    mainElement: repeats[i],
                    nextElement: repeats[i].parentNode.childNodes[j+1] || null,
                    parent: repeats[i].parentNode,
                    variable: result[1],
                    object: result[2],
                    elements: []
                });

                repeats[i].parentNode.removeChild(repeats[i]);
                repeats[i].removeAttribute("hb-repeat");
            }
        }
    };

    Scope.prototype.applyRepeat = function(repeat){
        for (var i = 0; i < repeat.elements.length; i++) {
            repeat.elements[i].parentNode.removeChild(repeat.elements[i]);
        }
        repeat.elements = [];

        var object = this.get(repeat.object);
        if(object === undefined || object === null){
            return;
        }

        var scope = repeat.scope.get(), tree;
        for(var variable in object){
            if(object.hasOwnProperty(variable)){
                scope[repeat.variable] = object[variable];
                repeat.scope.applyTemplates();

                tree = repeat.mainElement.cloneNode(true);
                if(repeat.nextElement !== null){
                    repeat.parent.insertBefore(tree, repeat.nextElement);
                } else {
                    repeat.parent.appendChild(tree);
                }

                repeat.elements.push(tree);
            }
        }
    };

    Scope.prototype.applyTemplates = function(){
        for (var i = 0; i < this.repeats.length; i++) {
            this.applyRepeat(this.repeats[i]);
        }

        this.mainTemplate.apply();
    };

    Scope.HBREP_REG = /([a-zA-Z0-9_]+) in ([a-zA-Z0-9\._]+)/;
    
    /*-----  End of Scope  ------*/
    


    /*================================
    =            Template            =
    ================================*/
    
    function Template(scope){
        this.constructor = Template;

        this.mainElement = null;
        this.Scope = scope;
        this.vars = {};
    }

    Template.prototype.init = function(element){
        this.mainElement = element;
        this.extractVariablesFrom(element);
    };

    Template.prototype.extractVariablesFrom = function(element){
        var childs = [];
        for (var i = 0; i < element.childNodes.length; i++) {
            childs.push(element.childNodes[i]);
        }

        var text, result, tmp, variable;
        for (var i = 0; i < childs.length; i++) {
            if(childs[i].nodeType === Node.TEXT_NODE){
                text = childs[i];
                result = Variable.VAR_REG.exec(text.nodeValue);

                while(result !== null){
                    if(result.index > 0){
                        text = text.splitText(result.index);
                    }

                    tmp = text.splitText(result[0].length);

                    variable = new Variable(text);
                    if(this.vars[result[1]]){
                        this.vars[result[1]].push(variable);
                    } else {
                        this.vars[result[1]] = [variable];
                    }

                    text = tmp;
                    result = Variable.VAR_REG.exec(text.nodeValue);
                }
            } else {
                this.extractVariablesFrom(childs[i]);
            }
        }
    };

    Template.prototype.apply = function(){
        var data, i;
        for(var variable in this.vars){
            if(this.vars.hasOwnProperty(variable) && this.vars[variable].length > 0){
                data = this.Scope.get(variable);
                for (i = 0; i < this.vars[variable].length; i++) {
                    this.vars[variable][i].exec(data);
                }
            }
        }
    };
    
    /*-----  End of Template  ------*/



    /*================================
    =            Variable            =
    ================================*/
    
    function Variable(reference){
        this.constructor = Variable;

        this.reference = reference;
        reference.nodeValue = "";
    }

    Variable.prototype.exec = function(content){
        this.reference.nodeValue = content;
    };

    Variable.VAR_REG = /\{\{\s?([a-zA-Z0-9\._]+)\s?\}\}/;
    
    /*-----  End of Variable  ------*/


        /*========================================
    =            Error Management            =
    ========================================*/
    
    var gErrors = {
        InvalidHBRepeat: function(repeat){
            this.message = "Invalid hb-repeat => " + repeat;
        }
    };

    function stackTrace(){
        var stack = new Error().stack.split('\n');
        stack.shift();
        if(stack[0] === "Error"){
            stack.shift();
        }
        return stack.join('\n');
    }

    function raise(errName, payload){
        var error = new gErrors[errName](payload);
        error.name = errName;

        console.error("HTMLBindings Error: %s - %s\n%s",
            error.name,
            error.message,
            stackTrace());

        throw new Error("HTMLBindings Exception");
    }

    function assert(assertion, errName, payload){
        if(!assertion){
            raise(errName, payload);
        }
    }
    
    /*-----  End of Error Management  ------*/
    



    /*==========  TEST  ==========*/
    
    window.$bodyScope = new Scope();
    $bodyScope.initTemplate(document.body);

    $bodyScope.scope.title = "Music";
    $bodyScope.scope.tracks = [
        {
            name: "Frailty",
            artist: "Prince Whateverer",
            comments: [
                {
                    author: "Seris",
                    message: "Great music ! Love it :)"
                },

                {
                    author: "NatsuCake",
                    message: "D:"
                }
            ]
        },

        {
            name: "Smile Smile Smile!",
            artist: "Daniel Ingram",
            comments: [
                {
                    author: "Retidurc",
                    message: "Quel est le muscle ?"
                },

                {
                    author: "Kiyonary",
                    message: "Snoop doog, il est enceinte !"
                }
            ]
        }
    ];

    $bodyScope.applyTemplates();
})();